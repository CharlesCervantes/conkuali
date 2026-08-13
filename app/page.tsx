import { redirect } from "next/navigation";

export default function Home() {
  // El proxy ya garantiza que solo llega aquí una request con sesión válida.
  redirect("/dashboard");
}
