import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: "3rem", fontFamily: "sans-serif" }}>
      <h1>Club SAAS</h1>
      <p>Fundaciones (M0) en construcción.</p>
      <Link href="/login">Ingresar</Link>
    </main>
  );
}
