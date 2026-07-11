"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Crown,
  Loader2,
  ArrowLeft,
  BookOpen,
  X,
  Bug,
  Globe,
  Trash2,
} from "lucide-react";

import { nanoid } from "nanoid";
import { supabase } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // New state for the Join flow
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showRules, setShowRules] = useState(false);

  // Bug Report States
  const [showBugModal, setShowBugModal] = useState(false);
  const [bugText, setBugText] = useState("");
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);
  const [bugSubmitted, setBugSubmitted] = useState(false);

  useEffect(() => {
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      setName(savedName);
      setIsSubmitted(true);
    }

    // --- NEW: INTERCEPT DIRECT LINKS ---
    // Check if the URL has a ?join=CODE parameter
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get("join");
    
    if (joinParam) {
      setJoinCode(joinParam.toUpperCase());
      // If they ALREADY had a name but clicked a link, skip to the join screen
      if (savedName) setIsJoining(true); 
    }
  }, []);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length > 0) {
      setIsSubmitted(true);
      // --- NEW: AUTO-ADVANCE ---
      // If they arrived via a direct link, instantly move them to the breach screen
      if (joinCode) setIsJoining(true);
    }
  };

  const handleClearCache = () => {
    if (
      window.confirm(
        "Abort mission? This will clear your alias and reset your local session.",
      )
    ) {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    }
  };

  const handleHostGame = async () => {
    setIsLoading(true);
    const roomCode = nanoid(7).toUpperCase();

    const { error: roomError } = await supabase
      .from("rooms")
      .insert([{ code: roomCode, status: "LOBBY" }]);

    if (roomError) {
      console.error("Error creating room:", roomError);
      setIsLoading(false);
      return;
    }

    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .insert([{ 
        room_code: roomCode, 
        name: name, 
        is_host: true, 
        status: "ACCEPTED" // 🚀 FIX: Instantly accept the host upon creation
      }])
      .select()
      .single();

    if (playerError) {
      console.error("Error joining as host:", playerError);
      setIsLoading(false);
      return;
    }

    localStorage.setItem("playerId", playerData.id);
    localStorage.setItem("playerName", name);
    router.push(`/room/${roomCode}`);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg("");

    const code = joinCode.toUpperCase().trim();

    // 1. Check if the room exists and is in the Lobby state
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("*")
      .eq("code", code)
      .single();

    if (roomError || !room) {
      setErrorMsg("Invalid clearance code.");
      setIsLoading(false);
      return;
    }

    if (room.status !== "LOBBY") {
      setErrorMsg("Operation already in progress.");
      setIsLoading(false);
      return;
    }

    // 2. Insert the player as a non-host
    const { data: playerData, error: playerError } = await supabase
      .from("players")
      .insert([{ room_code: code, name: name, is_host: false }])
      .select()
      .single();

    if (playerError) {
      setErrorMsg("Infiltration failed.");
      setIsLoading(false);
      return;
    }

    // 3. Save session and route to room
    localStorage.setItem("playerId", playerData.id);
    localStorage.setItem("playerName", name);
    router.push(`/room/${code}`);
  };

  const handleBugSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bugText.trim()) return;

    setIsSubmittingBug(true);
    await supabase
      .from("bug_reports")
      .insert([{ description: bugText.trim() }]);

    setIsSubmittingBug(false);
    setBugSubmitted(true);

    // Auto-close after a success message
    setTimeout(() => {
      setShowBugModal(false);
      setBugText("");
      setBugSubmitted(false);
    }, 2000);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white relative">
      {/* 007-STYLE HEADER */}
      <h1 className="text-4xl md:text-5xl font-serif tracking-[0.3em] uppercase mb-12 text-center text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
        Deduction Matrix
      </h1>

      {/* --- TOP LEFT BUTTONS: REPORT & CONTRIBUTE --- */}
      <div className="absolute top-6 left-6 flex items-center gap-3">
        <button
          onClick={() => setShowBugModal(true)}
          className="flex items-center gap-2 text-zinc-500 hover:text-red-500 transition-colors bg-zinc-950 px-4 py-2 rounded-sm border border-zinc-800 hover:border-red-900 uppercase tracking-widest text-xs font-bold"
        >
          <Bug size={14} />
          <span className="hidden sm:inline">Report</span>
        </button>
        <a
          href="https://github.com/debaditya99/DeductionMatrix"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-zinc-500 hover:text-white transition-colors bg-zinc-950 px-4 py-2 rounded-sm border border-zinc-800 hover:border-zinc-500 uppercase tracking-widest text-xs font-bold"
        >
          <Globe size={14} />
          <span className="hidden sm:inline">Intel</span>
        </a>
      </div>

      {/* --- HOW TO PLAY BUTTON --- */}
      <button
        onClick={() => setShowRules(true)}
        className="absolute top-6 right-6 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors bg-zinc-950 px-4 py-2 rounded-sm border border-zinc-800 hover:border-zinc-500 uppercase tracking-widest text-xs font-bold"
      >
        <BookOpen size={14} />
        <span className="hidden sm:inline">Briefing</span>
      </button>

      {/* MAIN DOSSIER CARD */}
      <div className="w-full max-w-sm bg-zinc-950 p-8 border border-zinc-800 shadow-2xl relative overflow-hidden">
        {/* Decorative corner accents */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-500"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-zinc-500"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-zinc-500"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-500"></div>

        {!isSubmitted ? (
          <form onSubmit={handleNameSubmit} className="flex flex-col gap-6">
            <div>
              <label
                htmlFor="playerName"
                className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2 block"
              >
                Identify Yourself
              </label>
              <input
                id="playerName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-900 border-b-2 border-zinc-700 text-white placeholder-zinc-700 focus:outline-none focus:border-white transition-colors font-mono uppercase tracking-wider"
                placeholder="Enter Alias..."
                required
                maxLength={20}
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              className="w-full py-4 bg-white text-zinc-950 font-bold uppercase tracking-widest text-sm hover:bg-zinc-300 transition-colors"
            >
              Initialize
            </button>
          </form>
        ) : isJoining ? (
          <form onSubmit={handleJoinSubmit} className="flex flex-col gap-6">
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => {
                  setIsJoining(false);
                  setErrorMsg("");
                }}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
                Infiltrate Lobby
              </p>
            </div>

            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 bg-zinc-900 border-b-2 border-zinc-700 text-white placeholder-zinc-700 focus:outline-none focus:border-emerald-500 transition-colors font-mono uppercase tracking-widest text-center text-lg"
              placeholder="7-CHAR-CODE"
              required
              maxLength={7}
              autoComplete="off"
            />

            {errorMsg && (
              <p className="text-red-500 text-xs tracking-widest uppercase text-center font-bold">
                {errorMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || joinCode.length !== 7}
              className="w-full flex items-center justify-center gap-3 py-4 bg-emerald-900 text-emerald-400 font-bold uppercase tracking-widest text-sm border border-emerald-700 hover:bg-emerald-800 transition-colors disabled:opacity-50"
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              {isLoading ? "Breaching..." : "Access"}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center mb-2">
              <p className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
                Operative Confirmed
              </p>
              <p className="text-white font-mono uppercase tracking-widest">
                {name}
              </p>
            </div>
            <button
              className="flex items-center justify-center gap-3 w-full py-4 bg-amber-500 text-zinc-950 font-bold uppercase tracking-widest text-sm hover:bg-amber-400 transition-colors disabled:opacity-50"
              onClick={handleHostGame}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Crown size={18} />
              )}
              {isLoading ? "Generating..." : "Host Operation"}
            </button>
            <button
              className="flex items-center justify-center gap-3 w-full py-4 bg-zinc-950 text-emerald-500 font-bold uppercase tracking-widest text-sm border border-emerald-900 hover:border-emerald-500 hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
              onClick={() => setIsJoining(true)}
              disabled={isLoading}
            >
              <Users size={18} />
              Join Operation
            </button>
          </div>
        )}
      </div>

      <div className="absolute bottom-8 flex flex-col items-center gap-1">
        <a
          href="https://github.com/debaditya99/DeductionMatrix"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#DEBAD7] text-xs uppercase tracking-widest font-medium hover:text-zinc-400 transition-colors"
        >
          Developed by Deb♟️
        </a>
      </div>

      <div className="absolute bottom-6 right-6">
        <button
          onClick={handleClearCache}
          title="Abort Mission"
          className="flex items-center gap-2 text-zinc-700 hover:text-red-500 transition-colors bg-zinc-950 px-4 py-2 border border-zinc-900 hover:border-red-900 uppercase tracking-widest text-xs font-bold"
        >
          <Trash2 size={14} />
          <span className="hidden sm:inline">Abort</span>
        </button>
      </div>

      {/* --- CLASSIFIED RULES MODAL --- */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-700 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="text-xl font-serif tracking-widest uppercase text-white flex items-center gap-3">
                <BookOpen className="text-red-500" size={20} /> Mission Briefing
              </h2>
              <button
                onClick={() => setShowRules(false)}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 flex flex-col gap-6 text-zinc-300 font-mono text-sm">
              <div>
                <h3 className="text-white uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                  <span className="text-amber-500">01.</span> The Infiltration
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  You will be dropped into an encrypted, anonymous chat room
                  with unknown operatives. You have exactly{" "}
                  <strong className="text-white">30 seconds</strong> to gather
                  intel.
                </p>
              </div>

              <div>
                <h3 className="text-white uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                  <span className="text-blue-500">02.</span> The Deceit
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Trust no one. Mask your digital footprint, lie, and deflect
                  suspicion. You earn{" "}
                  <strong className="text-blue-400">Deception Points</strong>{" "}
                  for every operative you successfully fool.
                </p>
              </div>

              <div>
                <h3 className="text-white uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                  <span className="text-emerald-500">03.</span> The Deduction
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Read between the lines. When the timer hits zero, you must
                  lock in your targets. You earn{" "}
                  <strong className="text-emerald-400">Deduction Points</strong>{" "}
                  for every alias you correctly identify.
                </p>
              </div>

              <div>
                <h3 className="text-white uppercase tracking-widest font-bold mb-2 flex items-center gap-2">
                  <span className="text-red-500">04.</span> The Objective
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Succeeding on both fronts makes you a{" "}
                  <strong className="text-purple-400">Double Agent</strong>.
                  Accumulate the most points across all rounds to win.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-zinc-800 bg-zinc-900/50">
              <button
                onClick={() => setShowRules(false)}
                className="w-full py-4 bg-white text-zinc-950 font-bold uppercase tracking-widest text-sm hover:bg-zinc-300 transition-colors"
              >
                Understood, Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- BUG REPORT MODAL --- */}
      {showBugModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-700 w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-zinc-800 bg-zinc-900/50">
              <h2 className="text-xl font-serif tracking-widest uppercase text-white flex items-center gap-3">
                <Bug className="text-red-500" size={20} /> Report Intel
              </h2>
              <button
                onClick={() => {
                  setShowBugModal(false);
                  setBugSubmitted(false);
                }}
                className="text-zinc-500 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              {bugSubmitted ? (
                <div className="flex flex-col items-center justify-center py-8 text-emerald-500 gap-3">
                  <div className="w-16 h-16 border border-emerald-900 bg-emerald-950/30 flex items-center justify-center">
                    <Bug size={32} />
                  </div>
                  <p className="font-bold uppercase tracking-widest text-sm mt-4">
                    Intel Secured
                  </p>
                  <p className="text-zinc-500 text-xs font-mono uppercase">
                    The matrix is being patched.
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleBugSubmit}
                  className="flex flex-col gap-4"
                >
                  <p className="text-xs font-mono uppercase text-zinc-500 mb-2">
                    Encountered a system anomaly? File a report.
                  </p>
                  <textarea
                    value={bugText}
                    onChange={(e) => setBugText(e.target.value)}
                    placeholder="Describe the anomaly..."
                    className="w-full bg-zinc-900 border border-zinc-700 p-4 focus:outline-none focus:border-red-500 transition-colors resize-none h-32 font-mono text-sm text-white placeholder-zinc-600"
                    required
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingBug || !bugText.trim()}
                    className="w-full py-4 bg-red-900 text-red-100 font-bold uppercase tracking-widest text-sm border border-red-700 hover:bg-red-800 transition-colors disabled:opacity-50 flex justify-center items-center gap-3"
                  >
                    {isSubmittingBug ? (
                      <Loader2 className="animate-spin" size={16} />
                    ) : (
                      "Transmit"
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}