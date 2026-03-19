"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginExtremeMinimalism() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Animation d'entrée et de transition (Warp)
  const [warpStyle, setWarpStyle] = useState("opacity-0 blur-xl scale-[1.5]");

  // Déclenche l'animation d'apparition au chargement
  useEffect(() => {
    setTimeout(() => setWarpStyle("opacity-100 blur-0 scale-100"), 100);
  }, []);

  const handleNext = () => {
    if (step === 0 && email.trim() !== "") {
      setError("");
      setWarpStyle("opacity-0 blur-md scale-[1.1]");
      setTimeout(() => {
        setStep(1);
        setWarpStyle("opacity-100 blur-0 scale-100");
      }, 300);
    } else if (step === 1 && password.trim() !== "") {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (step === 1) {
      setError("");
      setWarpStyle("opacity-0 blur-md scale-[0.9]");
      setTimeout(() => {
        setStep(0);
        setWarpStyle("opacity-100 blur-0 scale-100");
      }, 300);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError("");
    setWarpStyle("opacity-50 blur-sm scale-100 animate-pulse"); // Effet de chargement

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (res?.error) {
      setIsLoading(false);
      setError("ACCÈS REFUSÉ");
      setWarpStyle("opacity-100 blur-0 scale-100");
    } else {
      // Animation de "Plongeon" vers l'application
      setWarpStyle("opacity-0 blur-xl scale-[0.5] saturate-0");
      setTimeout(() => {
        router.push("/");
      }, 600);
    }
  };

  return (
    <main className="flex flex-col h-[100dvh] w-screen bg-black font-sans overflow-hidden text-white relative">
      <div className={`flex-1 flex flex-col transition-all duration-500 ease-out ${warpStyle}`}>
        
        <div className="flex-1 w-full flex flex-col items-center justify-center p-8 max-w-[800px] mx-auto relative">
          
          {/* ÉTAPE 0 : EMAIL */}
          {step === 0 && (
            <div className="flex flex-col items-center gap-8 w-full animate-fade-in">
              <span className="text-white/50 font-mono tracking-widest uppercase text-xs md:text-sm">Identification</span>
              <input 
                autoFocus 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleNext()} 
                className="w-full bg-transparent text-4xl md:text-7xl font-black text-white text-center outline-none tracking-tighter placeholder:text-white/10 transition-all focus:placeholder:text-transparent" 
                placeholder="EMAIL" 
                disabled={isLoading}
              />
            </div>
          )}

          {/* ÉTAPE 1 : MOT DE PASSE */}
          {step === 1 && (
            <div className="flex flex-col items-center gap-8 w-full animate-fade-in">
              <span className="text-white/50 font-mono tracking-widest uppercase text-xs md:text-sm">Clé d'accès</span>
              <input 
                autoFocus 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                onKeyDown={(e) => e.key === 'Enter' && handleNext()} 
                className="w-full bg-transparent text-5xl md:text-7xl font-black text-white text-center outline-none tracking-[0.3em] placeholder:text-white/10 transition-all focus:placeholder:text-transparent" 
                placeholder="••••••••" 
                disabled={isLoading}
              />
            </div>
          )}

          {/* AFFICHAGE DES ERREURS */}
          {error && (
            <div className="absolute bottom-10 md:bottom-20 text-red-500 font-mono text-xs md:text-sm tracking-[0.3em] uppercase bg-red-500/10 px-6 py-3 border border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.2)] animate-fade-in">
              [ {error} ]
            </div>
          )}
        </div>

        {/* CONTRÔLES / BOUTONS */}
        <div className="w-full flex justify-between p-8 md:p-12 text-xs md:text-sm font-mono uppercase tracking-[0.3em] font-bold text-white/50">
           <button 
             onClick={handlePrev} 
             disabled={isLoading}
             className={`transition-colors py-4 px-6 md:px-8 border border-transparent ${step === 0 ? 'opacity-0 pointer-events-none' : 'hover:text-white hover:border-white/20'}`}
           >
             Précédent
           </button>
           
           <button 
             onClick={handleNext} 
             disabled={isLoading || (step === 0 && email.trim() === '') || (step === 1 && password.trim() === '')}
             className={`transition-colors py-4 px-6 md:px-8 border ${
               isLoading 
                 ? 'border-white/10 text-white/30 animate-pulse' 
                 : (step === 0 && email.trim() === '') || (step === 1 && password.trim() === '')
                    ? 'border-white/10 text-white/20 pointer-events-none'
                    : 'border-white/20 hover:bg-white hover:text-black text-white'
             }`}
           >
             {isLoading ? 'Vérification...' : (step === 1 ? 'Accéder' : 'Suivant')}
           </button>
        </div>

      </div>
    </main>
  );
}