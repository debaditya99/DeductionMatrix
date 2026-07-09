"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Crown, Loader2, ArrowLeft } from "lucide-react";
import { nanoid } from "nanoid";
import { supabase } from "@/lib/supabase";import { useEffect } from "react";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  
  // New state for the Join flow
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      setName(savedName);
      setIsSubmitted(true);
    }
  }, []);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length > 0) setIsSubmitted(true);
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
      .insert([{ room_code: roomCode, name: name, is_host: true }])
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
      setErrorMsg("Room not found. Check the code.");
      setIsLoading(false);
      return;
    }

    if (room.status !== "LOBBY") {
      setErrorMsg("This game has already started!");
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
      setErrorMsg("Failed to join room.");
      setIsLoading(false);
      return;
    }

    // 3. Save session and route to room
    localStorage.setItem("playerId", playerData.id);
    localStorage.setItem("playerName", name);
    router.push(`/room/${code}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
      <h1 className="text-5xl font-bold tracking-tight mb-12 text-center drop-shadow-md">
        Deduction Matrix
      </h1>

      <div className="w-full max-w-sm bg-zinc-900 p-8 rounded-2xl border border-zinc-800 shadow-2xl">
        {!isSubmitted ? (
          <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
            <label htmlFor="playerName" className="text-sm font-medium text-zinc-400">
              Enter your alias
            </label>
            <input
              id="playerName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors"
              placeholder="e.g. Detective Pika..."
              required
              maxLength={20}
              autoComplete="off"
            />
            <button
              type="submit"
              className="mt-2 px-4 py-3 bg-white text-zinc-950 font-bold rounded-lg hover:bg-zinc-200 transition-colors"
            >
              Enter Matrix
            </button>
          </form>
        ) : isJoining ? (
          <form onSubmit={handleJoinSubmit} className="flex flex-col gap-4">
            <div className="flex items-center gap-2 mb-2">
              <button 
                type="button" 
                onClick={() => { setIsJoining(false); setErrorMsg(""); }}
                className="text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
              <p className="text-sm font-medium text-zinc-400">Join a Room</p>
            </div>
            
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              className="px-4 py-3 rounded-lg bg-zinc-950 border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-400 transition-colors uppercase font-mono tracking-widest text-center"
              placeholder="7-CHAR-CODE"
              required
              maxLength={7}
              autoComplete="off"
            />
            
            {errorMsg && <p className="text-red-400 text-sm text-center font-medium">{errorMsg}</p>}

            <button
              type="submit"
              disabled={isLoading || joinCode.length !== 7}
              className="mt-2 flex items-center justify-center gap-2 px-4 py-3 bg-zinc-100 text-zinc-950 font-bold rounded-lg hover:bg-zinc-300 transition-colors disabled:opacity-50"
            >
              {isLoading && <Loader2 className="animate-spin" size={18} />}
              {isLoading ? "Joining..." : "Join"}
            </button>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-center text-zinc-400 mb-2">
              Welcome, <span className="text-white font-bold">{name}</span>
            </p>
            <button
              className="flex items-center justify-center gap-3 px-4 py-4 bg-zinc-100 text-zinc-950 font-bold rounded-xl hover:bg-zinc-300 transition-colors disabled:opacity-50"
              onClick={handleHostGame}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Crown size={20} />}
              {isLoading ? "Creating Room..." : "Host a Game"}
            </button>
            <button
              className="flex items-center justify-center gap-3 px-4 py-4 bg-zinc-800 text-white font-bold rounded-xl hover:bg-zinc-700 transition-colors border border-zinc-700 disabled:opacity-50"
              onClick={() => setIsJoining(true)}
              disabled={isLoading}
            >
              <Users size={20} />
              Join a Game
            </button>
          </div>
        )}
      </div>
      {/* --- CUTE CUSTOM FOOTER --- */}
      <div className="absolute bottom-8 flex flex-col items-center gap-1">
        <a
          href="https://github.com/debaditya99/DeductionMatrix"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#DEBAD7] text-sm font-medium hover:opacity-80 transition-opacity flex items-center gap-1.5"
        >
          Created by Deb ✨
        </a>
      </div>
    </main>
  );
}