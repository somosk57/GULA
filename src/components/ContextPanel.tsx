import { useState } from "react";
import { AppState, CONTEXT_TEMPLATE, Project } from "../types";
import { copyText } from "../backend";
import { buildAiPackage } from "../ai";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

/**
 * Contexto del proyecto: lo que le pegás a la IA al abrir un chat nuevo.
 * "Copiar para la IA" arma contexto + bitácora reciente + último prompt.
 */
export function ContextPanel({ project, update }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const flash = (k: string) => {
    setCopied(k);
    setTimeout(() => setCopied(null), 1200);
  };

  const setContext = (v: string) =>
    update((d) => {
      d.projects.find((p) => p.id === project.id)!.context = v;
    });

  return (
    <div className="context">
      <div className="panel-actions">
        <button
          className={"chip primary" + (copied === "ai" ? " ok" : "")}
          onClick={async () => {
            await copyText(buildAiPackage(project));
            flash("ai");
          }}
          title="Copia contexto + estado + bitácora reciente + último prompt, listo para pegar en un chat nuevo"
        >
          {copied === "ai" ? "Copiado ✓" : "Copiar para la IA"}
        </button>
        <button
          className={"chip" + (copied === "ctx" ? " ok" : "")}
          onClick={async () => {
            await copyText(project.context);
            flash("ctx");
          }}
        >
          {copied === "ctx" ? "Copiado ✓" : "Solo contexto"}
        </button>
        {!project.context.trim() && (
          <button className="chip add" onClick={() => setContext(CONTEXT_TEMPLATE.replace("{name}", project.name))}>
            Usar plantilla
          </button>
        )}
      </div>
      <textarea
        className="context-body"
        value={project.context}
        onChange={(e) => setContext(e.target.value)}
        placeholder={"Qué es el proyecto, stack, decisiones, convenciones, estado.\nEsto es lo que la IA necesita saber cuando abrís un chat nuevo."}
        spellCheck={false}
      />
    </div>
  );
}
