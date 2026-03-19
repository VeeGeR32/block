"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const [formData, setFormData] = useState({ name: "", email: "", password: "", image: "" });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      router.push("/login?registered=true");
    } else {
      const data = await res.json();
      setError(data.message || "Erreur lors de la création du compte.");
      setIsLoading(false);
    }
  };

  return (
    <main className="flex h-screen w-screen bg-white items-center justify-center font-sans">
      <div className="w-full max-w-md p-8 border-4 border-black bg-white shadow-2xl">
        <header className="mb-8 border-b-2 border-gray-100 pb-4">
          <h1 className="text-3xl font-black uppercase tracking-tighter text-black">Initialisation</h1>
          <p className="text-xs font-mono text-gray-400 mt-1 tracking-widest uppercase">Création du système fractal</p>
        </header>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          {error && <div className="bg-red-500 text-white text-xs font-bold p-3 uppercase tracking-widest">{error}</div>}
          
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Nom d'Architecte</label>
            <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full border-b-2 border-gray-200 py-2 text-sm outline-none focus:border-black transition-colors" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Identifiant (Email)</label>
            <input type="email" name="email" required value={formData.email} onChange={handleChange} className="w-full border-b-2 border-gray-200 py-2 text-sm outline-none focus:border-black transition-colors" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Mot de passe</label>
            <input type="password" name="password" required value={formData.password} onChange={handleChange} className="w-full border-b-2 border-gray-200 py-2 text-sm outline-none focus:border-black transition-colors" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500">URL Avatar (Optionnel)</label>
            <input type="url" name="image" value={formData.image} onChange={handleChange} placeholder="https://..." className="w-full border-b-2 border-gray-200 py-2 text-sm outline-none focus:border-black transition-colors" />
          </div>

          <button type="submit" disabled={isLoading} className={`mt-4 w-full bg-black text-white py-4 text-xs font-bold uppercase tracking-widest transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-800'}`}>
            {isLoading ? "Création..." : "Générer la Matrice"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/login" className="text-[10px] font-bold uppercase tracking-widest text-gray-400 hover:text-black border-b border-transparent hover:border-black pb-1 transition-all">
            Déjà un système ? Se connecter
          </Link>
        </div>
      </div>
    </main>
  );
}