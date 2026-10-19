import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import { ErrorInterpretacion, type InterpretadorEstructurado, type ResultadoInterpretacion, type UsoParcialConocido } from "./tipos";

function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Única pieza de todo Arqento que conoce el SDK de OpenAI — ningún otro
// archivo (ni el resto de lib/server/inteligencia/, ni mucho menos
// Contabilidad) debe importar "openai" directamente. Implementa
// InterpretadorEstructurado tal cual; el dominio solo conoce esa interfaz
// (Carga inteligente de documentos, Fase 2 — benchmark de interpretación).
//
// Usa la Responses API (client.responses.parse) con zodTextFormat — es la
// vía oficial recomendada por OpenAI para la familia GPT-5 con salida
// validada contra un schema Zod. El resultado SIEMPRE se re-valida con el
// propio schema Zod antes de devolverse (nunca se confía ciegamente en la
// garantía "strict" del proveedor).
//
// reasoning.effort = "minimal": esta tarea es extracción estructurada, no
// razonamiento profundo — mantiene el benchmark representativo de un uso
// económico real, no del modo más caro disponible del modelo.

const MODELO_DEFAULT = "gpt-5-nano";

function cliente(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY no está configurada. Agrega OPENAI_API_KEY=sk-... a .env.local (nunca se versiona)."
    );
  }
  return new OpenAI({ apiKey });
}

export function crearInterpretadorOpenAI(modelo: string = MODELO_DEFAULT): InterpretadorEstructurado {
  return {
    nombre: `openai-${modelo}`,
    async interpretar<T>(args: {
      texto?: string;
      imagenes?: { base64: string; mimeType: string }[];
      schema: ZodType<T>;
      nombreSchema: string;
      instrucciones: string;
      contextoUsuario?: string;
    }): Promise<ResultadoInterpretacion<T>> {
      if (!args.texto && !(args.imagenes && args.imagenes.length > 0)) {
        throw new Error("interpretar() requiere texto o imagenes — ninguno de los dos fue proporcionado.");
      }

      const openai = cliente();
      const inicio = Date.now();

      // El contenido del documento viaja SIEMPRE como input del usuario,
      // delimitado explícitamente, nunca mezclado con las instrucciones del
      // sistema — las instrucciones (confiables) y el documento (dato no
      // confiable) son dos canales separados a propósito. El contexto
      // opcional aportado por un humano es un canal adicional, igual de
      // separado del documento — misma llamada, nunca una segunda request.
      //
      // Modalidad texto: se mantiene el formato simple de string (sin
      // cambios de comportamiento respecto al benchmark ya validado).
      // Modalidad imagen: requiere el formato estructurado de "input items"
      // de la Responses API — un bloque input_image por página/imagen,
      // todas en el mismo mensaje de usuario.
      const input: Parameters<typeof openai.responses.parse>[0]["input"] = args.imagenes?.length
        ? [
            {
              role: "user",
              content: [
                ...(args.texto ? [{ type: "input_text" as const, text: `<documento>\n${args.texto}\n</documento>` }] : []),
                ...args.imagenes.map((imagen) => ({
                  type: "input_image" as const,
                  image_url: `data:${imagen.mimeType};base64,${imagen.base64}`,
                  detail: "high" as const,
                })),
                ...(args.contextoUsuario
                  ? [{ type: "input_text" as const, text: `<contexto_usuario>\n${args.contextoUsuario}\n</contexto_usuario>` }]
                  : []),
              ],
            },
          ]
        : args.contextoUsuario
          ? `<documento>\n${args.texto}\n</documento>\n<contexto_usuario>\n${args.contextoUsuario}\n</contexto_usuario>`
          : `<documento>\n${args.texto}\n</documento>`;

      // Si la llamada misma falla (red, auth, rate limit, timeout) nunca hay
      // respuesta del proveedor — no existe uso real que registrar, nunca se
      // inventa (ErrorInterpretacion con usoParcial=null).
      let respuesta: Awaited<ReturnType<typeof openai.responses.parse>>;
      try {
        respuesta = await openai.responses.parse({
          model: modelo,
          reasoning: { effort: "minimal" },
          instructions: args.instrucciones,
          input,
          text: { format: zodTextFormat(args.schema, args.nombreSchema) },
        });
      } catch (error) {
        throw new ErrorInterpretacion(mensajeDeError(error), null);
      }

      const duracionMs = Date.now() - inicio;
      const uso = respuesta.usage;
      // A partir de aquí el proveedor SÍ respondió — aunque algo falle
      // después (salida no parseable, no pasa el schema), ya hay tokens
      // reales que registrar como consumo.
      const usoParcial: UsoParcialConocido = uso
        ? { tokensEntrada: uso.input_tokens ?? 0, tokensSalida: uso.output_tokens ?? 0, duracionMs }
        : null;

      if (!respuesta.output_parsed) {
        throw new ErrorInterpretacion("OpenAI no devolvió una salida parseable según el schema solicitado.", usoParcial);
      }

      // Re-validación explícita — nunca se confía solo en output_parsed.
      let datos: T;
      try {
        datos = args.schema.parse(respuesta.output_parsed);
      } catch (error) {
        throw new ErrorInterpretacion(`La salida de OpenAI no pasó la validación del schema: ${mensajeDeError(error)}`, usoParcial);
      }

      return {
        datos,
        tokensEntrada: uso?.input_tokens ?? 0,
        tokensSalida: uso?.output_tokens ?? 0,
        tokensRazonamiento: uso?.output_tokens_details?.reasoning_tokens ?? null,
        duracionMs,
      };
    },
  };
}
