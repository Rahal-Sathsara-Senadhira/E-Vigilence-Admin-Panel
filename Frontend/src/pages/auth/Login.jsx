import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { setAuth } from "../../utils/auth";
import { api } from "../../services/api";
import { isStationRole } from "../../utils/roles";
import { useTheme } from "../../hooks/useTheme";
import { Mail, Lock, Eye, EyeOff, Sun, Moon } from "lucide-react";

// Typewriter Component for the Tagline
const TypewriterText = ({ text }) => {
  const [displayText, setDisplayText] = useState("");
  
  useEffect(() => {
    let current = "";
    let i = 0;
    let isDeleting = false;
    let timer;

    function loop() {
      if (!isDeleting && i <= text.length) {
        setDisplayText(text.slice(0, i));
        i++;
        timer = setTimeout(loop, 80); // Typing speed
      } else if (!isDeleting && i > text.length) {
        isDeleting = true;
        timer = setTimeout(loop, 3000); // Pause at end before deleting
      } else if (isDeleting && i > 0) {
        setDisplayText(text.slice(0, i));
        i--;
        timer = setTimeout(loop, 40); // Deleting speed
      } else {
        isDeleting = false;
        timer = setTimeout(loop, 1000); // Pause before restarting
      }
    }
    
    timer = setTimeout(loop, 500);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <p className="text-[20px] text-[#DBEAFE] font-normal mt-3.5 text-center min-h-[30px] flex items-center justify-center">
      {displayText}
      <span className="inline-block w-[2px] h-[22px] bg-[#DBEAFE] ml-1 animate-blink"></span>
    </p>
  );
};

export default function Login() {
  const nav = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/api/auth/login", { email, password });
      const token = res?.data?.token;
      const user = res?.data?.user;

      if (!token || !user) {
        throw new Error("Unexpected response from server");
      }

      setAuth({ token, user });

      if (isStationRole(user.role)) nav("/station/inbox", { replace: true });
      else nav("/dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  const isDark = theme === "dark";

  return (
    <div 
      className="min-h-screen flex flex-col md:flex-row overflow-hidden font-['Inter',sans-serif] p-0 md:p-1 box-border transition-colors duration-300"
      style={{ backgroundColor: isDark ? "#0f172a" : "#f8fafc" }}
    >
      {/* Viewport Outer Frame */}
      <div 
        className="flex flex-col md:flex-row w-full h-full md:h-[calc(100vh-8px)] rounded-none md:rounded-lg overflow-hidden transition-colors duration-300 relative"
        style={{ border: `2px solid ${isDark ? "#334155" : "#94A3B8"}` }}
      >
        
        {/* Theme Toggle */}
        <div className="fixed top-6 right-6 z-50">
          <button
            onClick={toggleTheme}
            className="group flex items-center justify-center w-[42px] h-[42px] rounded-full backdrop-blur-md bg-white/20 hover:bg-white/30 border border-white/30 shadow-lg transition-all duration-300"
            aria-label="Toggle Theme"
          >
            {isDark ? (
              <Sun className="h-5 w-5 text-amber-300 group-hover:rotate-45 transition-transform duration-300" />
            ) : (
              <Moon className="h-5 w-5 text-slate-900 group-hover:-rotate-12 transition-transform duration-300" />
            )}
          </button>
        </div>

        {/* Left Column - Brand Showcase (Navy Blue) */}
        <div 
          className="w-full md:w-1/2 min-h-[40vh] md:min-h-full relative flex flex-col items-center justify-center p-12 z-10 overflow-hidden"
          style={{ 
            backgroundColor: "#0F294D", 
            borderRight: "1px solid rgba(255, 255, 255, 0.1)" 
          }}
        >
          {/* Smooth geometric gradient overlay (Dashboard theme match) */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.15),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(15,23,42,0.4),transparent_50%)] pointer-events-none"></div>
          
          <div className="relative z-10 w-full max-w-[640px] flex flex-col items-center text-center">
            
            {/* Transparent Brand Emblem with Intricate Internal Shine */}
            <div className="relative w-full max-w-[280px] md:max-w-[320px] aspect-square flex justify-center items-center group">
              {/* The Base Logo SVG */}
              <img 
                src="/logo.svg" 
                alt="E-Vigilance Logo" 
                className="w-full h-full object-contain drop-shadow-2xl transition-transform duration-700 ease-out group-hover:scale-105"
                style={{ filter: "drop-shadow(0 10px 30px rgba(59, 130, 246, 0.35))" }} 
              />
              {/* CSS SVG Mask Shine Overlay */}
              <div 
                className="absolute inset-0 pointer-events-none animate-logo-shine opacity-60"
                style={{
                  WebkitMaskImage: "url(/logo.svg)",
                  WebkitMaskSize: "contain",
                  WebkitMaskRepeat: "no-repeat",
                  WebkitMaskPosition: "center",
                  maskImage: "url(/logo.svg)",
                  maskSize: "contain",
                  maskRepeat: "no-repeat",
                  maskPosition: "center",
                  background: "linear-gradient(110deg, transparent 20%, rgba(255,255,255,0.8) 30%, transparent 40%)",
                  backgroundSize: "250% 100%"
                }}
              ></div>
            </div>
            
            {/* Title */}
            <h1 
              className="font-extrabold text-[#FFFFFF] mt-6 tracking-[-0.02em]"
              style={{ fontSize: "clamp(28px, 4vw, 38px)" }}
            >
              E-Vigilance
            </h1>
            
            {/* Animated Tagline Typewriter */}
            <TypewriterText text="Vigilant Eyes, Safer Roads." />
          </div>
        </div>

        {/* Right Column - Authentication (Alert Orange) */}
        <div 
          className="w-full md:w-1/2 min-h-[60vh] md:min-h-full relative flex items-center justify-center p-4 md:p-8 z-20"
          style={{ backgroundColor: "#EA580C" }}
        >
          {/* Subtle orange glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[70%] bg-[#F97316] rounded-full opacity-20 blur-[80px] pointer-events-none"></div>

          {/* Login Dialog Box (Pure White) */}
          <div 
            className="w-full max-w-[440px] rounded-[20px] relative z-30 transition-colors duration-300"
            style={{
              padding: "44px 36px",
              backgroundColor: isDark ? "#0A1E38" : "#FFFFFF", 
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.4)",
              border: "1px solid rgba(255, 255, 255, 0.8)"
            }}
          >
            {/* Header Inside Dialog */}
            <div className="mb-8 text-center md:text-left">
              <h2 
                className="text-[24px] font-bold mb-1"
                style={{ color: isDark ? "#FFFFFF" : "#0F172A" }}
              >
                E-Vigilance
              </h2>
              <p 
                className="text-[13px] font-medium"
                style={{ color: isDark ? "#94A3B8" : "#64748B" }}
              >
                Admin / Station Login
              </p>
            </div>

            {error && (
              <div className="mb-6 rounded-[10px] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0"></span>
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="flex flex-col gap-5">
              
              {/* Email Input */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Mail 
                    className="h-5 w-5 transition-colors group-focus-within:text-[#0F294D]" 
                    style={{ stroke: isDark ? "#94A3B8" : "#64748B" }}
                  />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="block w-full h-[50px] pl-11 pr-4 rounded-[10px] outline-none transition-all text-[14px] focus:ring-[3px] focus:ring-[#0F294D]/10"
                  style={{
                    backgroundColor: isDark ? "#122B4F" : "#F1F5F9",
                    border: `1.5px solid ${isDark ? "#1E3A8A" : "#E2E8F0"}`,
                    color: isDark ? "#FFFFFF" : "#0F172A"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#0F294D"}
                  onBlur={(e) => e.target.style.borderColor = isDark ? "#1E3A8A" : "#E2E8F0"}
                />
              </div>

              {/* Password Input */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock 
                    className="h-5 w-5 transition-colors group-focus-within:text-[#0F294D]" 
                    style={{ stroke: isDark ? "#94A3B8" : "#64748B" }}
                  />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="block w-full h-[50px] pl-11 pr-11 rounded-[10px] outline-none transition-all text-[14px] focus:ring-[3px] focus:ring-[#0F294D]/10"
                  style={{
                    backgroundColor: isDark ? "#122B4F" : "#F1F5F9",
                    border: `1.5px solid ${isDark ? "#1E3A8A" : "#E2E8F0"}`,
                    color: isDark ? "#FFFFFF" : "#0F172A"
                  }}
                  onFocus={(e) => e.target.style.borderColor = "#0F294D"}
                  onBlur={(e) => e.target.style.borderColor = isDark ? "#1E3A8A" : "#E2E8F0"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center transition-colors hover:opacity-70"
                  style={{ color: isDark ? "#94A3B8" : "#64748B" }}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {/* Secondary Links */}
              <div className="flex justify-between items-center px-1 pt-1 pb-2">
                <a 
                  href="#" 
                  className="text-[13px] font-medium hover:underline transition-colors"
                  style={{ color: isDark ? "#60A5FA" : "#0F294D" }}
                >
                  Register / Help
                </a>
                <a 
                  href="#" 
                  className="text-[13px] font-medium hover:underline transition-colors"
                  style={{ color: isDark ? "#60A5FA" : "#0F294D" }}
                >
                  Forgot Password?
                </a>
              </div>

              {/* Primary Action */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-[50px] rounded-[10px] text-[15px] font-semibold text-white transition-all duration-300 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-[1px]"
                style={{ backgroundColor: "#0F294D" }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#0A1E38"}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#0F294D"}
              >
                {loading ? "Authenticating..." : "Sign In"}
              </button>
            </form>

            {/* Footer Note */}
            <div className="mt-8 text-center">
              <p 
                className="text-[11px] font-bold uppercase" 
                style={{ 
                  color: isDark ? "#64748B" : "#94A3B8",
                  letterSpacing: "0.08em"
                }}
              >
                Authorized Law Enforcement Access Only
              </p>
            </div>

          </div>
        </div>
      </div>
      
      {/* Animation Keyframes inside a style block */}
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s step-end infinite;
        }

        @keyframes logo-shine {
          0% { background-position: 250% 0; }
          100% { background-position: -250% 0; }
        }
        .animate-logo-shine {
          animation: logo-shine 5s infinite cubic-bezier(0.4, 0, 0.2, 1);
        }
      `}</style>
    </div>
  );
}
