import { createContext, lazy, Suspense, useContext, useEffect, useState } from "react";
import { CircleUser } from "lucide-react";
import { authCall, rpc, setUnauthorizedHandler } from "./api";
import { isCapacitor, tokenStore } from "./platform";
import { go, href, useRoute, type Route } from "./router";
import { Loading } from "./ui";
import { Login } from "./screens/Login";
import { Brand } from "@shared/ui/auth";
import { Companies } from "./screens/Companies";
const Account = lazy(() => import("./screens/Account").then((m) => ({ default: m.Account })));
const CompanyRoutes = lazy(() => import("./screens/company").then((m) => ({ default: m.CompanyRoutes })));

export type Me = { id: string; name: string; lastName: string; email: string; twoFactorEnabled: boolean | null };
const SessionCtx = createContext<{ me: Me; signOut: () => Promise<void> } | null>(null);
export const useSession = () => useContext(SessionCtx)!;

export function App() {
  const route = useRoute();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setMe(null);
      go("entrar");
    });
    tokenStore.get().then((t) => (t ? rpc<Me>("me").then(setMe, () => setMe(null)) : setMe(null)));
  }, []);
  // Botón "atrás" del sistema en Android.
  useEffect(() => {
    if (!isCapacitor) return;
    let remove = () => {};
    import("@capacitor/app").then(({ App: CapApp }) =>
      CapApp.addListener("backButton", ({ canGoBack }) => (canGoBack ? history.back() : CapApp.exitApp())).then((h) => (remove = () => h.remove())),
    );
    return () => remove();
  }, []);
  if (me === undefined) return <main className="standalone"><Loading /></main>;
  if (!me) return <Login onSignedIn={(m) => { setMe(m); go("empresas"); }} />;
  const signOut = async () => {
    await authCall("logout", {}).catch(() => {});
    await tokenStore.clear();
    setMe(null);
    go("entrar");
  };
  return (
    <SessionCtx.Provider value={{ me, signOut }}>
      <Routes route={route} />
    </SessionCtx.Provider>
  );
}

function Routes({ route }: { route: Route }) {
  const [first, cid, ...rest] = route.path;
  return (
    <Suspense fallback={<main className="standalone"><Loading /></main>}>
      {first === "c" && cid ? <CompanyRoutes key={cid} companyId={cid} path={rest} query={route.query} /> : <Standalone>{first === "cuenta" ? <Account /> : <Companies />}</Standalone>}
    </Suspense>
  );
}

function Standalone({ children }: { children: React.ReactNode }) {
  return (
    <main className="standalone">
      <div className="standalone-top">
        <Brand href={href("empresas")} />
        <a className="icon-btn" href={href("cuenta")} aria-label="Mi cuenta"><CircleUser className="icon" aria-hidden="true" /></a>
      </div>
      {children}
    </main>
  );
}
