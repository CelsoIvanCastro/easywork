import { redirect } from "next/navigation";
import { getSession } from "@/server/web";

export default async function Home() {
  redirect((await getSession()) ? "/empresas" : "/entrar");
}
