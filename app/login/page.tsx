// app/login/page.tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {    e.preventDefault();
    setIsLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Identifiants incorrects.");
      setIsLoading(false);
    } else {
      router.push("/"); // Retour à la fractale !
    }
  };

  return (
    <main className="flex h-screen w-screen bg-white items-center justify-center font-sans">
      <div className="w-full max-w-md p-8 border-4 border-black bg-white shadow-2xl">
        <header className="mb-8 border-b-2 border-gray-100 pb-4">
          <h1 className="text-3xl font-black uppercase tracking-tighter text-black">Connexion</h1>
          <p className="text-xs font-mono text-gray-400 mt-1 tracking-widest uppercase">Initialisation du système</p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {error && <div className="bg-red-500 text-white text-xs font-bold p-3 uppercase tracking-widest">{error}</div>}
          
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Identifiant (Email)</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-b-2 border-gray-200 py-2 text-sm outline-none focus:border-black transition-colors"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Mot de passe</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-b-2 border-gray-200 py-2 text-sm outline-none focus:border-black transition-colors"
            />
          </div>

          <button 
            type="submit" 
            disabled={isLoading}
            className={`mt-4 w-full bg-black text-white py-4 text-xs font-bold uppercase tracking-widest transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'}`}
          >
            {isLoading ? "Vérification..." : "Accéder à la fractale"}
          </button>
        </form>
        <div className="mt-6 text-center">
          <Link href="/register" className="text-[10px] font-bold uppercase tracking-widest text-[#F05A28] hover:text-black border-b border-transparent hover:border-black pb-1 transition-all">
            Créer un nouveau système
          </Link>
        </div>
      </div>
    </main>
  );
}