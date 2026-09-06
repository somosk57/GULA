// Canal de voz en la red local: esta parte es sólo el "portero".
//
// Una PC hace de anfitriona y prende este servidorcito; las otras se conectan
// con su IP. El audio NO pasa por acá: el servidor sólo pasa mensajes cortos
// para que los navegadores se encuentren (WebRTC), y después cada PC habla
// directo con la otra. Por eso no hay servidores afuera, ni cuentas, ni nada
// que mantener prendido: si hay wifi, hay canal.
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tungstenite::{accept, Message};

/// Por ahora tres, como pediste. Subirlo es cambiar este número.
pub const MAX_PEERS: usize = 3;
pub const DEFAULT_PORT: u16 = 57157;

type Peers = Arc<Mutex<HashMap<u32, Sender<String>>>>;

struct Running {
    stop: Arc<AtomicBool>,
    port: u16,
}

fn slot() -> &'static Mutex<Option<Running>> {
    static S: OnceLock<Mutex<Option<Running>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

/// La IP de esta PC en la red local, que es la que le pasás a los demás.
pub fn local_ip() -> String {
    // No manda nada: sólo le pregunta al sistema por qué placa saldría.
    if let Ok(s) = UdpSocket::bind("0.0.0.0:0") {
        if s.connect("8.8.8.8:80").is_ok() {
            if let Ok(a) = s.local_addr() {
                return a.ip().to_string();
            }
        }
    }
    "127.0.0.1".to_string()
}

/// Deja de escuchar. Los que ya estaban hablando siguen: el audio va directo.
pub fn stop() {
    if let Some(r) = slot().lock().unwrap().take() {
        r.stop.store(true, Ordering::Relaxed);
        // Un golpecito para que el accept() salga del bloqueo enseguida.
        let _ = TcpStream::connect(("127.0.0.1", r.port));
    }
}

/// Prende el portero en `port`. Devuelve la dirección para pasarle a los demás.
pub fn start(port: u16) -> Result<String, String> {
    stop();
    let listener = TcpListener::bind(("0.0.0.0", port)).map_err(|e| format!("No pude abrir el puerto {port}: {e}"))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let stop_flag = Arc::new(AtomicBool::new(false));
    let peers: Peers = Arc::new(Mutex::new(HashMap::new()));
    let next = Arc::new(AtomicU32::new(1));

    {
        let stop_flag = stop_flag.clone();
        thread::spawn(move || {
            while !stop_flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((stream, _)) => {
                        let peers = peers.clone();
                        let next = next.clone();
                        thread::spawn(move || serve(stream, peers, next));
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(80)),
                    Err(_) => thread::sleep(Duration::from_millis(200)),
                }
            }
        });
    }

    *slot().lock().unwrap() = Some(Running { stop: stop_flag, port });
    Ok(format!("{}:{}", local_ip(), port))
}

/// Manda un texto a los demás (o a uno solo, si el mensaje trae "to").
fn route(peers: &Peers, from: u32, mut v: Value) {
    let to = v.get("to").and_then(|x| x.as_u64()).map(|x| x as u32);
    if let Some(o) = v.as_object_mut() {
        o.insert("from".into(), json!(from));
    }
    let text = v.to_string();
    let map = peers.lock().unwrap();
    for (id, tx) in map.iter() {
        if *id == from {
            continue;
        }
        if let Some(t) = to {
            if *id != t {
                continue;
            }
        }
        let _ = tx.send(text.clone());
    }
}

fn serve(stream: TcpStream, peers: Peers, next: Arc<AtomicU32>) {
    let _ = stream.set_nodelay(true);
    let mut ws = match accept(stream) {
        Ok(w) => w,
        Err(_) => return,
    };
    // Lecturas cortas: así el mismo hilo puede escribir lo que le mandan los otros.
    let _ = ws.get_ref().set_read_timeout(Some(Duration::from_millis(60)));

    let id = next.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = channel::<String>();

    let others: Vec<u32> = {
        let mut map = peers.lock().unwrap();
        if map.len() >= MAX_PEERS {
            let _ = ws.send(Message::Text(json!({ "t": "full", "max": MAX_PEERS }).to_string().into()));
            let _ = ws.close(None);
            return;
        }
        let list = map.keys().copied().collect();
        map.insert(id, tx);
        list
    };

    let _ = ws.send(Message::Text(json!({ "t": "hello", "id": id, "peers": others }).to_string().into()));
    route(&peers, id, json!({ "t": "join" }));

    loop {
        // 1) Lo que me mandan los otros.
        while let Ok(msg) = rx.try_recv() {
            if ws.send(Message::Text(msg.into())).is_err() {
                break;
            }
        }
        // 2) Lo que dice éste.
        match ws.read() {
            Ok(Message::Text(t)) => {
                if let Ok(v) = serde_json::from_str::<Value>(&t) {
                    route(&peers, id, v);
                }
            }
            Ok(Message::Close(_)) => break,
            Ok(_) => {}
            Err(tungstenite::Error::Io(ref e))
                if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(_) => break,
        }
    }

    peers.lock().unwrap().remove(&id);
    route(&peers, id, json!({ "t": "leave" }));
}
