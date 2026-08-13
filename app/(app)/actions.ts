"use server";

import { redirect } from "next/navigation";
import { cerrarSesion } from "@/lib/server/auth/service";

export async function logout() {
  await cerrarSesion();
  redirect("/login");
}
