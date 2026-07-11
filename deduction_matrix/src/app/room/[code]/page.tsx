"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Crown,
  User,
  Check,
  Users,
  Loader2,
  Ghost,
  Eye,
  Skull,
  Copy,
  Terminal
} from "lucide-react";
import confetti from "canvas-confetti";

type Player = {
  id: string;
  name: string;
  is_host: boolean;
  status: "WAITING" | "ACCEPTED";
  score?: number;
  locked_guesses?: string[];
};

export function RoomCodeCopy({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-700 rounded-sm transition-all active:scale-95 group"
      aria-label="Copy room code"
    >
      <span className="text-red-500 tracking-widest font-mono text-lg">
        {code}
      </span>
      {copied ? (
        <Check size={16} className="text-emerald-500" />
      ) : (
        <Copy size={16} className="text-zinc-500 group-hover:text-white transition-colors" />
      )}
    </button>
  );
}

export default function RoomLobby() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params.code as string).toUpperCase();

  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [room, setRoom] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // --- NEW: DIRECT LINK JOIN STATES ---
  const [needsName, setNeedsName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [joinError, setJoinError] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  // ==========================================
  // EFFECT 1: DIRECT LINK AUTH & AUTO-JOIN
  // ==========================================
  useEffect(() => {
    const initializeJoinFlow = async () => {
      setIsLoading(true);
      const storedName = localStorage.getItem("playerName");
      const storedId = localStorage.getItem("playerId");

      // 1. Verify the room exists
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .single();

      if (roomError || !roomData) {
        window.location.href = "/"; // Room doesn't exist, kick to home
        return;
      }
      setRoom(roomData);

      // 2. If they have no alias, bounce them to the home page with a join ticket
      if (!storedName) {
        router.push(`/?join=${roomCode}`);
        return;
      }

      // 3. Check if they already possess a valid ID for THIS specific room
      let validPlayerId = null;
      if (storedId) {
        const { data: existingPlayer } = await supabase
          .from("players")
          .select("id")
          .eq("id", storedId)
          .eq("room_code", roomCode)
          .single();

        if (existingPlayer) validPlayerId = existingPlayer.id;
      }

      // 4. AUTO-JOIN: They have a name but aren't in this room yet
      if (!validPlayerId) {
        if (roomData.status !== "LOBBY") {
          setJoinError("Operation already in progress.");
          setNeedsName(true); // Show error on the join UI
          setIsLoading(false);
          return;
        }

        const { data: newPlayer, error: joinErr } = await supabase
          .from("players")
          .insert([{ room_code: roomCode, name: storedName, is_host: false }])
          .select()
          .single();

        if (newPlayer && !joinErr) {
          localStorage.setItem("playerId", newPlayer.id);
          validPlayerId = newPlayer.id;
        } else {
          setJoinError("Infiltration failed.");
          setNeedsName(true);
          setIsLoading(false);
          return;
        }
      }

      // 5. Success! Set the local ID to trigger the next useEffect
      setLocalPlayerId(validPlayerId);
    };

    initializeJoinFlow();
  }, [roomCode]);

  // ==========================================
  // EFFECT 2: DATA FETCHING & REAL-TIME
  // ==========================================
  useEffect(() => {
    // Wait until we have officially established the player's identity
    if (!localPlayerId) return;

    const setupRoom = async () => {
      const { data: playersData } = await supabase
        .from("players")
        .select("*")
        .eq("room_code", roomCode);

      if (playersData) setPlayers(playersData as Player[]);
      setIsLoading(false);
    };

    setupRoom();

    // Subscribe to BOTH players and rooms
    const channel = supabase
      .channel(`room:${roomCode}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "players", filter: `room_code=eq.${roomCode}` }, (payload) => {
        setPlayers((prev) => {
          if (prev.some((p) => p.id === payload.new.id)) return prev;
          return [...prev, payload.new as Player];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "players" }, (payload) => {
        setPlayers((prev) => prev.map((p) => p.id === payload.new.id ? ({ ...p, ...payload.new } as Player) : p));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "players" }, (payload) => {
        setPlayers((prev) => prev.filter((p) => p.id !== payload.old.id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${roomCode}` }, async () => {
        const { data } = await supabase.from("rooms").select("*").eq("code", roomCode).single();
        if (data) setRoom(data);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "rooms", filter: `code=eq.${roomCode}` }, () => { 
        window.location.href = "/"; 
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomCode, localPlayerId]);

  // --- SUBMIT MISSING NAME (DIRECT LINK) ---
  const handleDirectJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempName.trim()) return;
    
    setIsJoining(true);
    setJoinError("");

    const { data: roomData } = await supabase.from("rooms").select("status").eq("code", roomCode).single();
    
    if (!roomData || roomData.status !== "LOBBY") {
      setJoinError(roomData ? "Operation already in progress." : "Invalid clearance code.");
      setIsJoining(false);
      return;
    }

    const { data: newPlayer, error } = await supabase
      .from("players")
      .insert([{ room_code: roomCode, name: tempName.trim(), is_host: false }])
      .select()
      .single();

    if (newPlayer && !error) {
      localStorage.setItem("playerName", tempName.trim());
      localStorage.setItem("playerId", newPlayer.id);
      setNeedsName(false); // Hides the form
      setLocalPlayerId(newPlayer.id); // Triggers Effect #2
    } else {
      setJoinError("Infiltration failed.");
    }
    setIsJoining(false);
  };

  const handleStartGame = async () => {
    if (acceptedPlayers.length < 2) return;
    const shuffled = [...acceptedPlayers].sort(() => 0.5 - Math.random());

    // Create pairs with a unique groupId
    const newPairs = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      newPairs.push({ groupId: crypto.randomUUID(), players: shuffled.slice(i, i + 2) });
    }

    // Handle odd number of players
    if (
      newPairs.length > 1 &&
      newPairs[newPairs.length - 1].players.length === 1
    ) {
      const oddPlayer = newPairs.pop()!.players[0];
      newPairs[newPairs.length - 1].players.push(oddPlayer);
    }
    const chatEndsAt = new Date(Date.now() + 30000).toISOString();
    await supabase.from("rooms").update({ status: "PLAYING", round: 1, pairs: newPairs, chat_ends_at: chatEndsAt }).eq("code", roomCode);
  };

  // Actions
  const handleAcceptPlayer = async (playerId: string) => {
    await supabase.from("players").update({ status: "ACCEPTED" }).eq("id", playerId);
  };

  const handleAcceptAll = async () => {
    await supabase.from("players").update({ status: "ACCEPTED" }).eq("room_code", roomCode).eq("status", "WAITING");
  };

  const handleEndRoomLobby = async () => {
    setIsLoading(true);
    await supabase.from("rooms").delete().eq("code", roomCode);
    window.location.href = "/";
  };

  const handleLeaveRoom = async () => {
    setIsLoading(true);
    if (localPlayerId) {
      await supabase.from("players").delete().eq("id", localPlayerId);
    }
    window.location.href = "/";
  };

  if (isLoading) return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-500 font-mono text-sm uppercase tracking-widest">
      <Loader2 className="animate-spin text-emerald-500" />
      <p>Establishing secure uplink...</p>
    </div>
  );

  const currentPlayer = players.find((p) => p.id === localPlayerId);
  const waitingPlayers = players.filter((p) => p.status === "WAITING");
  const acceptedPlayers = players.filter((p) => p.status === "ACCEPTED");

  if (room?.status === "PLAYING") {
    const myPairGroup = room.pairs?.find((group: any) => group.players.some((p: Player) => p.id === localPlayerId));
    if (!myPairGroup) return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4 text-zinc-500 font-mono text-sm uppercase tracking-widest">
        <Loader2 className="animate-spin text-amber-500" />
        <p>Assigning tactical partners...</p>
      </div>
    );
    return (
      <BreakoutRoom
        roomCode={roomCode}
        groupId={myPairGroup.groupId}
        localPlayerId={localPlayerId!}
        groupPlayers={myPairGroup.players}
        allPlayers={acceptedPlayers}
        chatEndsAt={room.chat_ends_at}
        isHost={currentPlayer?.is_host || false}
        roomRound={room.round}
      />
    );
  }

  // --- PLAYER VIEW (WAITING) ---
  if (!currentPlayer?.is_host && currentPlayer?.status === "WAITING") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
        <div className="bg-zinc-950 border border-zinc-800 p-10 w-full max-w-md relative flex flex-col items-center shadow-2xl">
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-500"></div>
          <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-zinc-500"></div>
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-zinc-500"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-500"></div>

          <Terminal className="text-zinc-500 mb-6" size={40} />
          <h2 className="text-xl font-serif tracking-widest uppercase mb-2">Status: Pending</h2>
          <p className="text-zinc-500 mb-8 text-xs font-mono uppercase tracking-widest text-center">
            Awaiting clearance from host operative.
          </p>
          <button
            onClick={handleLeaveRoom}
            disabled={isLoading}
            className="w-full py-3 bg-zinc-900 border border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest text-xs hover:bg-red-950/30 hover:border-red-900 hover:text-red-500 disabled:opacity-50 transition-colors"
          >
            Abort Infiltration
          </button>
        </div>
      </main>
    );
  }

  // --- LOBBY SHELL (HOST & PLAYER) ---
  return (
    <main className="flex min-h-screen flex-col p-6 bg-zinc-950 text-white max-w-6xl mx-auto w-full">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 bg-zinc-950 border border-zinc-800 p-6 relative shadow-xl">
        <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-zinc-500"></div>
        <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-zinc-500"></div>
        
        <div>
          <h1 className="text-2xl font-serif uppercase tracking-widest flex items-center gap-4 text-zinc-300">
            Operation <RoomCodeCopy code={roomCode} />
          </h1>
          <p className="text-zinc-500 mt-2 flex items-center gap-2 text-xs font-mono uppercase tracking-widest">
            {currentPlayer?.is_host ? (
              <><Crown size={14} className="text-amber-500" /> Host Privileges Active</>
            ) : (
              <><User size={14} className="text-emerald-500" /> Infiltration Successful</>
            )}
          </p>
        </div>

        <div className="flex gap-4 w-full md:w-auto">
          {currentPlayer?.is_host ? (
            <>
              <button
                onClick={handleEndRoomLobby}
                disabled={isLoading}
                className="flex-1 md:flex-none px-6 py-3 bg-zinc-900 border border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest text-xs hover:border-red-900 hover:text-red-500 transition-colors rounded-sm disabled:opacity-50"
              >
                Burn Room
              </button>
              <div className="flex flex-col items-end gap-1 flex-1 md:flex-none">
                <button
                  onClick={handleStartGame}
                  disabled={acceptedPlayers.length < 2 || isLoading}
                  className="w-full px-8 py-3 bg-red-900 text-red-100 font-bold uppercase tracking-widest text-xs border border-red-700 hover:bg-red-800 transition-colors rounded-sm disabled:opacity-30"
                >
                  Initiate Operation
                </button>
                {acceptedPlayers.length < 4 && (
                  <p className="text-[12px] uppercase font-mono tracking-widest text-zinc-500 mt-1">
                    RECOMMENDED: 4+ Operatives
                  </p>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={handleLeaveRoom}
              disabled={isLoading}
              className="flex-1 md:flex-none px-6 py-3 bg-zinc-900 border border-zinc-700 text-zinc-400 font-bold uppercase tracking-widest text-xs hover:border-red-900 hover:text-red-500 transition-colors rounded-sm disabled:opacity-50"
            >
              Abort Mission
            </button>
          )}
        </div>
      </div>

      <div className={`grid grid-cols-1 ${currentPlayer?.is_host ? 'md:grid-cols-2' : ''} gap-8 flex-1`}>
        {/* Left Side: Waiting Lobby (HOST ONLY) */}
        {currentPlayer?.is_host && (
          <div className="bg-zinc-950 border border-zinc-800 p-6 flex flex-col relative">
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-700"></div>
            
            <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-800">
              <h2 className="text-sm font-mono uppercase tracking-widest flex items-center gap-2 text-zinc-400">
                <Users size={16} /> Pending Clearance ({waitingPlayers.length})
              </h2>
              {waitingPlayers.length > 0 && (
                <button
                  onClick={handleAcceptAll}
                  className="text-[10px] px-3 py-1.5 font-bold uppercase tracking-widest bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-sm transition-colors text-zinc-300"
                >
                  Approve All
                </button>
              )}
            </div>
            
            <div className="flex flex-col gap-2">
              {waitingPlayers.length === 0 ? (
                <p className="text-zinc-600 font-mono text-xs uppercase tracking-widest text-center py-8">
                  No pending requests
                </p>
              ) : (
                waitingPlayers.map((p) => (
                  <div key={p.id} className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-sm">
                    <span className="font-mono text-sm uppercase tracking-wider">{p.name}</span>
                    <button
                      onClick={() => handleAcceptPlayer(p.id)}
                      className="p-2 bg-emerald-950/30 border border-emerald-900 text-emerald-500 hover:bg-emerald-900 transition-colors rounded-sm"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Right Side: Accepted Players */}
        <div className="bg-zinc-950 border border-zinc-800 p-6 relative">
          <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-zinc-700"></div>
          
          <h2 className="text-sm font-mono uppercase tracking-widest mb-6 pb-4 border-b border-zinc-800 flex items-center gap-2 text-zinc-400">
            <Check className="text-emerald-500" size={16} /> Active Roster ({acceptedPlayers.length})
          </h2>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {acceptedPlayers.map((p) => (
              <div key={p.id} className="bg-zinc-900 border border-zinc-800 p-4 flex flex-col items-center justify-center gap-3 rounded-sm group">
                <div className={`w-10 h-10 rounded-sm flex items-center justify-center ${p.is_host ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-zinc-950 border border-zinc-700'}`}>
                  {p.is_host ? <Crown className="text-amber-500" size={20} /> : <User className="text-zinc-500" size={20} />}
                </div>
                <div className="flex flex-col items-center text-center">
                  <span className="font-mono text-xs uppercase tracking-widest text-zinc-300 truncate w-full max-w-[100px]">{p.name}</span>
                  {p.id === localPlayerId && (
                    <span className="text-[9px] text-emerald-500 font-bold tracking-widest uppercase mt-1">Local</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function BreakoutRoom({
  roomCode,
  groupId,
  localPlayerId,
  groupPlayers,
  allPlayers,
  chatEndsAt,
  isHost,
  roomRound,
}: {
  roomCode: string;
  groupId: string;
  localPlayerId: string;
  groupPlayers: any[];
  allPlayers: any[];
  chatEndsAt: string;
  isHost: boolean;
  roomRound: number;
}) {
  // ==========================================
  // 1. ALL HOOKS MUST GO AT THE TOP
  // ==========================================
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [phase, setPhase] = useState<"CHATTING" | "GUESSING" | "WAITING_GUESSES" | "REVEAL" | "WAITING">("CHATTING");
  const [pointsEarned, setPointsEarned] = useState<number>(0);
  const [deceptionPoints, setDeceptionPoints] = useState<number>(0);
  const [selectedGuesses, setSelectedGuesses] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const otherPlayers = groupPlayers.filter((p) => p.id !== localPlayerId);
  const requiredGuesses = otherPlayers.length;

  const strangerMap = Object.fromEntries(
    otherPlayers.map((p, index) => [
      p.id,
      {
        name: `TARGET_${index + 1}`,
        color: index === 0 ? "text-blue-400" : "text-emerald-400",
      },
    ]),
  );

  useEffect(() => {
    setPhase("CHATTING");
    setSelectedGuesses([]);
    setPointsEarned(0);
    setDeceptionPoints(0);
    supabase.from("players").update({ locked_guesses: null }).eq("id", localPlayerId);
  }, [roomRound]);

  useEffect(() => {
    if (phase !== "CHATTING" || !chatEndsAt) return;
    const endTarget = new Date(chatEndsAt).getTime();
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((endTarget - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setPhase("GUESSING");
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [chatEndsAt, phase]);

  // Hook: Fetch Messages
  useEffect(() => {
    if (phase !== "CHATTING") return;
    const fetchMessages = async () => {
      const { data } = await supabase.from("messages").select("*").eq("group_id", groupId).order("created_at", { ascending: true });
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel(`chat:${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` }, (payload) => setMessages((prev) => [...prev, payload.new]))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId, phase]);

  // Hook: Calculate Scores when everyone has guessed
  useEffect(() => {
    if (phase !== "WAITING_GUESSES") return;
    const myGroupPlayers = allPlayers.filter((p) => groupPlayers.some((gp) => gp.id === p.id));
    const everyoneGuessed = myGroupPlayers.every((p) => Array.isArray(p.locked_guesses));

    if (everyoneGuessed) {
      // Instantly change phase so this effect doesn't run twice
      setPhase("REVEAL");
      const calculateAndSaveScores = async () => {
        const me = myGroupPlayers.find((p) => p.id === localPlayerId);
        const others = myGroupPlayers.filter((p) => p.id !== localPlayerId);

        // --- CALCULATE DEDUCTION (Did I guess them?) ---
        const correctIds = others.map((p) => p.id);
        const myGuesses = Array.isArray(me?.locked_guesses) ? me.locked_guesses : [];
        const deductionPts = myGuesses.filter((id: string) => correctIds.includes(id)).length;

        // --- CALCULATE DECEPTION (Did they fail to guess me?) ---
        let deceptionPts = 0;
        others.forEach((other) => {
          const otherGuesses = Array.isArray(other.locked_guesses) ? other.locked_guesses : [];
          if (!otherGuesses.includes(localPlayerId)) deceptionPts += 1;
        });

        // --- UPDATE TOTAL ACCUMULATED SCORE ---
        const roundTotal = deductionPts + deceptionPts;
        if (roundTotal > 0) {
          const { data } = await supabase.from("players").select("score").eq("id", localPlayerId).single();
          const absoluteCurrentScore = data?.score || 0;
          await supabase.from("players").update({ score: absoluteCurrentScore + roundTotal }).eq("id", localPlayerId);
        }

        // --- TRIGGER UI REVEAL ---
        setPointsEarned(deductionPts);
        setDeceptionPoints(deceptionPts);

        if (deductionPts > 0) {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#10b981", "#3b82f6", "#ffffff"] });
        }
      };

      // Execute the math
      calculateAndSaveScores();
    }
  }, [allPlayers, phase, localPlayerId, groupPlayers]);

  // ==========================================
  // 2. HELPER FUNCTIONS
  // ==========================================

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || phase !== "CHATTING") return;
    const content = newMessage.trim();
    setNewMessage("");
    await supabase.from("messages").insert([{ room_code: roomCode, group_id: groupId, sender_id: localPlayerId, content }]);
  };

  const toggleGuess = (playerId: string) => {
    if (selectedGuesses.includes(playerId)) {
      setSelectedGuesses((prev) => prev.filter((id) => id !== playerId));
    } else if (selectedGuesses.length < requiredGuesses) {
      setSelectedGuesses((prev) => [...prev, playerId]);
    }
  };

  // --- UPDATED SUBMIT GUESS LOGIC ---
  const submitGuess = async () => {
    setIsProcessing(true);
    await supabase.from("players").update({ locked_guesses: selectedGuesses }).eq("id", localPlayerId);
    setPhase("WAITING_GUESSES");
    setIsProcessing(false);
  };

  // --- HOST CONTROLS ---
  const handleNextRound = async () => {
    setIsProcessing(true);
    const playersList = [...allPlayers];
    if (playersList.length % 2 !== 0) playersList.push({ id: "BYE" });
    const n = playersList.length;
    const shift = roomRound % (n - 1);
    const shiftedPlayers = [playersList[0], ...playersList.slice(1 + shift), ...playersList.slice(1, 1 + shift)];

    const newPairs: any[] = [];
    for (let i = 0; i < n / 2; i++) {
      const p1 = shiftedPlayers[i];
      const p2 = shiftedPlayers[n - 1 - i];
      if (p1.id !== "BYE" && p2.id !== "BYE") {
        newPairs.push({ groupId: crypto.randomUUID(), players: [p1, p2] });
      } else {
        const oddPlayer = p1.id === "BYE" ? p2 : p1;
        if (newPairs.length > 0) newPairs[newPairs.length - 1].players.push(oddPlayer);
        else newPairs.push({ groupId: crypto.randomUUID(), players: [oddPlayer] });
      }
    }

    await supabase.from("rooms").update({ round: roomRound + 1, pairs: newPairs, chat_ends_at: new Date(Date.now() + 30000).toISOString() }).eq("code", roomCode);
    setIsProcessing(false);
  };

  const handleEndRoom = async () => {
    setIsProcessing(true);
    await supabase.from("rooms").delete().eq("code", roomCode);
    window.location.href = "/";
  };

  // ==========================================
  // 3. RENDER BLOCKS (EARLY RETURNS)
  // ==========================================

  // --- RENDER 1: WAITING / LEADERBOARD ---
  if (phase === "WAITING") {
    const sortedLeaderboard = [...allPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white relative">
        <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 p-8 relative shadow-2xl">
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-500"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-500"></div>

          <h2 className="text-2xl font-serif uppercase tracking-[0.2em] mb-8 text-center text-zinc-200 border-b border-zinc-800 pb-4">
            Mission Debrief
          </h2>

          <div className="flex flex-col gap-2 mb-8">
            <div className="flex justify-between px-4 pb-2 text-[10px] uppercase font-mono tracking-widest text-zinc-600">
              <span>Operative</span>
              <span>Total Score</span>
            </div>
            {sortedLeaderboard.map((p, index) => (
              <div key={p.id} className="flex items-center justify-between p-4 bg-zinc-900 border border-zinc-800 rounded-sm group hover:border-zinc-700 transition-colors">
                <div className="flex items-center gap-4">
                  <span className={`font-mono text-xs w-6 text-center ${index === 0 ? "text-amber-500 font-bold" : "text-zinc-500"}`}>
                    0{index + 1}
                  </span>
                  <span className="font-mono text-sm uppercase tracking-wider text-zinc-300">
                    {p.name} {p.id === localPlayerId && <span className="text-[10px] text-emerald-500 ml-2">(Local)</span>}
                  </span>
                </div>
                <span className={`font-mono text-sm font-bold ${index === 0 ? "text-amber-500" : "text-zinc-400"}`}>
                  {p.score || 0}
                </span>
              </div>
            ))}
          </div>

          {isHost ? (
            <div className="flex flex-col gap-3">
              <button onClick={handleNextRound} disabled={isProcessing} className="w-full py-4 bg-zinc-200 text-zinc-950 font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors rounded-sm disabled:opacity-50">
                Initiate Round 0{roomRound + 1}
              </button>
              <button onClick={handleEndRoom} disabled={isProcessing} className="w-full py-3 bg-zinc-900 border border-zinc-700 text-red-500 font-bold uppercase tracking-widest text-xs hover:bg-red-950/30 hover:border-red-900 transition-colors rounded-sm disabled:opacity-50">
                End Operation
              </button>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 p-4 text-center rounded-sm">
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest animate-pulse">
                Awaiting Host Commands...
              </p>
            </div>
          )}
        </div>
      </main>
    );
  }

  // --- RENDER 2: REVEAL SCREEN ---
  if (phase === "REVEAL") {
    const actualNames = otherPlayers.map((p) => p.name).join(" & ");
    const totalPoints = pointsEarned + deceptionPoints;

    const hasDeduction = pointsEarned > 0;
    const hasDeception = deceptionPoints > 0;

    let status = { icon: <Skull size={32} />, title: "", desc: "", color: "", bg: "" };

    if (hasDeduction && hasDeception) {
      status = { icon: <Crown size={32} />, title: "Double Agent", desc: "Targets identified. Cover maintained.", color: "text-purple-400", bg: "bg-purple-950/20 border-purple-900/50" };
    } else if (hasDeduction && !hasDeception) {
      status = { icon: <Eye size={32} />, title: "Dead-On", desc: "Targets identified. Cover blown.", color: "text-emerald-400", bg: "bg-emerald-950/20 border-emerald-900/50" };
    } else if (!hasDeduction && hasDeception) {
      status = { icon: <Ghost size={32} />, title: "Deceptive", desc: "Targets missed. Cover maintained.", color: "text-blue-400", bg: "bg-blue-950/20 border-blue-900/50" };
    } else {
      status = { icon: <Skull size={32} />, title: "Compromised", desc: "Targets missed. Cover blown.", color: "text-red-500", bg: "bg-red-950/20 border-red-900/50" };
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white relative">
        <div className={`w-full max-w-lg bg-zinc-950 border ${status.bg} p-10 relative shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300`}>
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-700"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-700"></div>

          <div className={`mb-6 p-4 rounded-sm border ${status.bg} ${status.color}`}>
            {status.icon}
          </div>
          
          <h2 className={`text-2xl font-serif uppercase tracking-[0.2em] mb-2 ${status.color}`}>
            {status.title}
          </h2>
          <p className="text-zinc-400 text-xs font-mono uppercase tracking-widest mb-10 pb-6 border-b border-zinc-800 w-full">
            {status.desc}
          </p>

          <div className="grid grid-cols-3 gap-4 w-full mb-8">
            <div className="bg-zinc-900 p-4 border border-zinc-800 flex flex-col items-center justify-center rounded-sm">
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-2">Deduction</p>
              <p className="text-lg font-mono font-bold text-emerald-400">+{pointsEarned}</p>
            </div>
            <div className="bg-zinc-900 p-4 border border-zinc-800 flex flex-col items-center justify-center rounded-sm">
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-2">Deception</p>
              <p className="text-lg font-mono font-bold text-blue-400">+{deceptionPoints}</p>
            </div>
            <div className="bg-zinc-900 p-4 border border-zinc-700 flex flex-col items-center justify-center rounded-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent"></div>
              <p className="text-[10px] text-zinc-400 font-mono uppercase tracking-widest mb-2 relative z-10">Net Total</p>
              <p className="text-xl font-mono font-bold text-white relative z-10">+{totalPoints}</p>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 w-full p-6 mb-8 rounded-sm text-left">
            <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-widest mb-2">Identified Targets:</p>
            <p className="text-lg font-mono uppercase tracking-wider text-zinc-200">{actualNames}</p>
          </div>

          <button onClick={() => setPhase("WAITING")} className="w-full py-4 bg-zinc-200 text-zinc-950 font-bold uppercase tracking-widest text-xs hover:bg-white transition-colors rounded-sm">
            View Standings
          </button>
        </div>
      </main>
    );
  }

  // --- RENDER 3: WAITING FOR OPPONENTS TO GUESS ---
  if (phase === "WAITING_GUESSES") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
        <div className="w-full max-w-sm bg-zinc-950 border border-zinc-800 p-10 relative flex flex-col items-center text-center shadow-xl">
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-700"></div>
          <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-700"></div>
          
          <Loader2 className="animate-spin text-zinc-500 mb-6" size={32} />
          <h2 className="text-sm font-mono uppercase tracking-widest text-zinc-300 mb-2">Data Locked</h2>
          <p className="text-zinc-600 text-xs font-mono uppercase tracking-widest">
            Awaiting intel from other operatives...
          </p>
        </div>
      </main>
    );
  }

  // --- RENDER 4: GUESSING ---
  if (phase === "GUESSING") {
    const guessablePlayers = allPlayers.filter((p) => p.id !== localPlayerId);

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
        <div className="w-full max-w-2xl text-center mb-10">
          <h2 className="text-3xl font-serif uppercase tracking-[0.2em] mb-4 text-zinc-200">
            Identify Targets
          </h2>
          <p className="text-zinc-500 text-sm font-mono uppercase tracking-widest">
            Select <span className="text-red-500 font-bold">{requiredGuesses}</span> operative{requiredGuesses > 1 ? "s" : ""} from the database.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl mb-10">
          {guessablePlayers.map((p) => {
            const isSelected = selectedGuesses.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleGuess(p.id)}
                className={`p-5 rounded-sm font-mono text-sm uppercase tracking-wider transition-all border ${
                  isSelected 
                  ? "bg-red-950/30 text-red-400 border-red-900 shadow-[0_0_15px_rgba(153,27,27,0.2)]" 
                  : "bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-600"
                }`}
              >
                {p.name}
              </button>
            );
          })}
        </div>

        <button
          onClick={submitGuess}
          disabled={selectedGuesses.length !== requiredGuesses}
          className="bg-zinc-200 text-zinc-950 px-10 py-4 font-bold uppercase tracking-widest text-xs rounded-sm hover:bg-white disabled:opacity-30 disabled:hover:bg-zinc-200 transition-colors"
        >
          Lock In Selection
        </button>
      </main>
    );
  }

  // --- RENDER 5: CHATTING ---
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white relative">
      <div className="w-full max-w-2xl mb-4 flex justify-between items-end border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-serif uppercase tracking-[0.2em] text-red-500 animate-pulse flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500"></div> Encrypted Channel
          </h1>
          <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-widest mt-2">
            Intercepting {otherPlayers.length} unknown signal{otherPlayers.length > 1 ? "s" : ""}
          </p>
        </div>
        <div className={`text-3xl font-mono font-bold tracking-widest ${timeLeft <= 10 ? "text-red-500" : "text-zinc-300"}`}>
          00:{timeLeft.toString().padStart(2, "0")}
        </div>
      </div>

      <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 h-[500px] flex flex-col p-4 relative shadow-2xl">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-zinc-700"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-zinc-700"></div>

        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-4 mb-4">
          {messages.length === 0 ? (
            <p className="text-zinc-600 text-center text-[10px] font-mono uppercase tracking-widest mt-4">
              Uplink established. Connection secure. Begin transmission.
            </p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === localPlayerId;
              const strangerInfo = strangerMap[msg.sender_id];
              return (
                <div key={msg.id} className={`flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && strangerInfo && (
                    <span className={`text-[9px] font-mono font-bold px-1 tracking-widest uppercase ${strangerInfo.color}`}>
                      {strangerInfo.name}
                    </span>
                  )}
                  <div className={`px-4 py-3 max-w-[80%] rounded-sm text-sm font-mono ${
                    isMe 
                    ? "bg-zinc-800 text-zinc-200 border border-zinc-700" 
                    : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Transmit message..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-sm px-4 py-3 font-mono text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-zinc-200 text-zinc-950 px-6 font-bold uppercase tracking-widest text-xs rounded-sm hover:bg-white disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
      </div>
    </main>
  );
}