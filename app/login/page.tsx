"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Montserrat } from "next/font/google";
import { Mail, Lock, Eye, EyeOff, ArrowRight, Building2, Receipt, PieChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { login, type LoginState } from "./actions";

// Tipografía propia de esta pantalla (marca Arqento) — el resto de la app
// sigue usando Geist (app/layout.tsx, sin tocar). Escopado aquí vía
// next/font/google, sin agregar ninguna dependencia nueva.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Paleta propia de Arqento (verde bosque casi negro #152420 + dorado
// #c99a63) — nunca var(--brand)/var(--brand-foreground): esas variables son
// el acento de Conkuali como tenant y se sobreescriben en tiempo de
// ejecución por Empresa (ver app/globals.css) — el login es la única
// pantalla pública, antes de resolver ningún tenant, así que su marca debe
// ser fija (Rediseño de login, septiembre 2026).

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  );
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [mostrarAyudaPassword, setMostrarAyudaPassword] = useState(false);

  return (
    <div className={cn(montserrat.className, "relative min-h-screen bg-white md:grid md:grid-cols-2 lg:grid-cols-[62%_38%]")}>
      {/* Panel izquierdo — fotografía, oculta en celulares */}
      <div className="relative hidden overflow-hidden md:flex md:flex-col md:justify-between">
        <Image
          src="/images/login/casa-arqento.png"
          alt=""
          fill
          priority
          sizes="(min-width: 768px) 62vw, 0px"
          className="object-cover object-[62%_55%]"
        />
        {/* Degradado oscuro sutil — más oscuro arriba/abajo (donde va texto),
            más claro en medio (donde se aprecia la arquitectura). */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />

        {/* Encabezado */}
        <div className="enter relative z-10 flex items-start justify-between gap-4 p-9 lg:p-12">
          {/* LogoSF.png = el ícono "A" solo; LetrasSF.png = el wordmark de
              texto — ambos con canal alfa real (confirmado en los PNG),
              directo sobre la fotografía, sin tarjeta ni recuadro detrás. */}
          <div className="flex items-center gap-3">
            <Image
              src="/images/branding/LogoSF.png"
              alt=""
              width={1536}
              height={1024}
              className="h-10 w-auto drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
            />
            <Image
              src="/images/branding/LetrasSF.png"
              alt="Arqento"
              width={2172}
              height={724}
              className="h-7 w-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]"
            />
          </div>

          <div className="hidden text-right lg:block">
            <p className="text-[11px] font-semibold tracking-[0.28em] text-white/75">
              PLATAFORMA DE
              <br />
              GESTIÓN DE PROYECTOS
            </p>
            <div className="ml-auto mt-2 h-px w-10" style={{ backgroundColor: "#c99a63" }} />
          </div>
        </div>

        {/* Bloque inferior — titular, subtítulo y características */}
        <div className="relative z-10 p-9 lg:p-12">
          <div
            className="enter mb-5 h-1 w-14 rounded-full"
            style={{ background: "linear-gradient(90deg, #e3bd8c, #a97a45)", transitionDelay: "60ms" }}
          />
          <h1 className="enter text-4xl leading-[1.08] font-extrabold text-white lg:text-5xl" style={{ transitionDelay: "100ms" }}>
            Construye
            <br />
            con visión.
          </h1>
          <p className="enter mt-3 text-lg font-medium text-white/85" style={{ transitionDelay: "160ms" }}>
            Controla cada detalle.
          </p>

          <div className="enter mt-9 flex flex-wrap gap-x-8 gap-y-4" style={{ transitionDelay: "220ms" }}>
            <Caracteristica icono={Building2} etiqueta={["Obras", "y proyectos"]} />
            <Caracteristica icono={Receipt} etiqueta={["Pagos", "semanales"]} />
            <Caracteristica icono={PieChart} etiqueta={["Información", "en tiempo real"]} />
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#faf8f4] px-6 py-12 sm:px-10">
        <DetallesGeometricos />

        <div className="relative z-10 w-full max-w-md">
          {/* Directo sobre el fondo claro, sin tarjeta — los dos archivos ya
              tienen canal alfa real, no hace falta ninguna superficie blanca
              detrás en este panel (a diferencia de la fotografía oscura). */}
          <div className="enter mb-10 flex flex-col items-center gap-3">
            <Image
              src="/images/branding/LogoSF.png"
              alt=""
              width={1536}
              height={1024}
              className="h-20 w-auto"
            />
            <Image
              src="/images/branding/LetrasSF.png"
              alt="Arqento"
              width={2172}
              height={724}
              className="h-11 w-auto"
            />
          </div>

          <Card className="enter p-8 sm:p-10" style={{ transitionDelay: "80ms" }}>
            <h2 className="text-2xl font-extrabold text-[#152420]">Bienvenido a Arqento</h2>
            <p className="mt-1.5 text-[15px] text-gray-500">Ingresa a tu espacio de trabajo.</p>

            <form action={action} className="mt-7 space-y-4">
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
                <input
                  name="email"
                  type="email"
                  placeholder="Correo electrónico"
                  required
                  autoComplete="email"
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 bg-white py-3 pr-4 pl-11 text-[15px] text-[#152420] transition-colors duration-150 ease-out placeholder:text-gray-400 focus:border-[#152420] focus:ring-2 focus:ring-[#152420]/10 focus:outline-none"
                />
              </div>

              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2 text-gray-400" />
                <input
                  name="password"
                  type={mostrarPassword ? "text" : "password"}
                  placeholder="Contraseña"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-gray-200 bg-white py-3 pr-11 pl-11 text-[15px] text-[#152420] transition-colors duration-150 ease-out placeholder:text-gray-400 focus:border-[#152420] focus:ring-2 focus:ring-[#152420]/10 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setMostrarPassword((v) => !v)}
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute top-1/2 right-3.5 -translate-y-1/2 text-gray-400 transition-colors duration-150 ease-out hover:text-[#152420]"
                >
                  {mostrarPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>

              {/* "Mantener sesión iniciada" no aplica: el sistema ya crea una
                  sola sesión de 7 días siempre (lib/server/session.ts), sin
                  distinción "recordar/no recordar" que una casilla pudiera
                  activar de verdad — agregarla habría sido un control sin
                  efecto real. */}
              <div className="flex items-center justify-end pt-0.5 text-sm">
                <button
                  type="button"
                  onClick={() => setMostrarAyudaPassword((v) => !v)}
                  className="font-medium underline-offset-2 hover:underline"
                  style={{ color: "#a97a45" }}
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
              {mostrarAyudaPassword && (
                <p className="enter rounded-lg bg-gray-50 px-3.5 py-2.5 text-xs text-gray-500">
                  No hay recuperación automática todavía — contacta a tu administrador para que te
                  restablezca el acceso.
                </p>
              )}

              {state?.error && (
                <p className="enter rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  {state.error}
                </p>
              )}

              <button
                type="submit"
                disabled={pending}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#152420] px-4 py-3 text-[15px] font-semibold text-white transition-[background-color,transform] duration-150 ease-out hover:bg-[#1d322c] active:scale-[0.98] disabled:opacity-60"
              >
                {pending ? "Ingresando…" : "Iniciar sesión"}
                {!pending && <ArrowRight className="h-[18px] w-[18px]" />}
              </button>
            </form>
          </Card>

          <p className="enter mt-8 text-center text-xs text-gray-400" style={{ transitionDelay: "140ms" }}>
            ARQENTO © 2026 · Gestión inteligente de proyectos.
          </p>
        </div>
      </div>
    </div>
  );
}

function Caracteristica({
  icono: Icono,
  etiqueta,
}: {
  icono: typeof Building2;
  etiqueta: [string, string];
}) {
  return (
    <div className="flex items-center gap-2.5">
      <Icono className="h-6 w-6 shrink-0" style={{ color: "#c99a63" }} strokeWidth={1.75} />
      <p className="text-sm leading-tight font-medium text-white">
        {etiqueta[0]}
        <br />
        {etiqueta[1]}
      </p>
    </div>
  );
}

// Detalles geométricos extremadamente sutiles del panel derecho — puras
// formas CSS (nunca un logotipo ni una imagen), ocultas en celulares para
// mantener esa pantalla limpia (ver instrucciones de responsive).
function DetallesGeometricos() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden sm:block" aria-hidden>
      <div
        className="absolute -top-24 -right-24 h-80 w-80 rotate-12 rounded-[3rem] border"
        style={{ borderColor: "rgba(21,36,32,0.05)" }}
      />
      <div
        className="absolute -bottom-32 -left-16 h-72 w-72 -rotate-12 rounded-[3rem] border"
        style={{ borderColor: "rgba(201,154,99,0.08)" }}
      />
      <div
        className="absolute top-1/3 -right-10 h-40 w-40 rotate-45"
        style={{ background: "linear-gradient(135deg, rgba(201,154,99,0.05), transparent)" }}
      />
    </div>
  );
}
