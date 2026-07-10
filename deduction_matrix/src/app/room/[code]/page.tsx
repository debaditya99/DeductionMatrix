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
  PartyPopper,
  Ghost,
  Eye,
  Skull,
  Copy
} from "lucide-react";
import confetti from "canvas-confetti";

type Player = {
  id: string;
  name: string;
  is_host: boolean;
  status: "WAITING" | "ACCEPTED";
  score?: number; // <-- Added this
  locked_guesses?: string[]; // <-- Added this
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
      className="flex items-center gap-2 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-md transition-all active:scale-95 group"
      aria-label="Copy room code"
    >
      <span className="text-red-500 tracking-widest font-mono">
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
  const [room, setRoom] = useState<any>(null); // <-- Add this
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem("playerId");
    if (!storedId) {
      router.push("/");
      return;
    }
    setLocalPlayerId(storedId);

    const fetchInitialData = async () => {
      // Fetch Room
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", roomCode)
        .single();
      if (roomData) setRoom(roomData);

      // Fetch Players & Auto-accept host
      await supabase
        .from("players")
        .update({ status: "ACCEPTED" })
        .eq("id", storedId)
        .eq("is_host", true);
      const { data: playersData } = await supabase
        .from("players")
        .select("*")
        .eq("room_code", roomCode);

      if (playersData) setPlayers(playersData as Player[]);
      setIsLoading(false);
    };

    fetchInitialData();

    // Subscribe to BOTH players and rooms
    const channel = supabase
      .channel(`room:${roomCode}`)
      // 1. The INSERT Listener
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "players",
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          setPlayers((prev) => {
            if (prev.some((p) => p.id === payload.new.id)) return prev;
            return [...prev, payload.new as Player];
          });
        },
      )
      // 2. The UPDATE Listener
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "players",
          // Note: If you have filter: `room_code=eq.${roomCode}` here,
          // make sure Supabase isn't dropping the event!
          // If it is, remove the filter line temporarily to test.
        },
        (payload) => {
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === payload.new.id
                ? ({ ...p, ...payload.new } as Player)
                : p,
            ),
          );
        },
      )
      // 3. The DELETE Listener (No filter, to bypass Supabase limitations)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "players",
        },
        (payload) => {
          setPlayers((prev) => prev.filter((p) => p.id !== payload.old.id));
        },
      )
      // 2. The Rooms Listener (forces fresh data sync so you don't have to refresh)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${roomCode}`,
        },
        async () => {
          const { data } = await supabase
            .from("rooms")
            .select("*")
            .eq("code", roomCode)
            .single();
          if (data) setRoom(data);
        },
      )
      // --- ADD THIS DELETE LISTENER ---
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "rooms",
          filter: `code=eq.${roomCode}`,
        },
        () => {
          window.location.href = "/"; // Instantly kicks everyone to the home page
        },
      )
      // --------------------------------
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, router]);

  const handleStartGame = async () => {
    if (acceptedPlayers.length < 2) return;

    const shuffled = [...acceptedPlayers].sort(() => 0.5 - Math.random());

    // Create pairs with a unique groupId
    const newPairs = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      newPairs.push({
        groupId: crypto.randomUUID(),
        players: shuffled.slice(i, i + 2),
      });
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

    await supabase
      .from("rooms")
      .update({
        status: "PLAYING",
        round: 1,
        pairs: newPairs,
        chat_ends_at: chatEndsAt,
      })
      .eq("code", roomCode);
  };

  // Actions
  const handleAcceptPlayer = async (playerId: string) => {
    await supabase
      .from("players")
      .update({ status: "ACCEPTED" })
      .eq("id", playerId);
  };

  const handleAcceptAll = async () => {
    await supabase
      .from("players")
      .update({ status: "ACCEPTED" })
      .eq("room_code", roomCode)
      .eq("status", "WAITING");
  };

  if (isLoading)
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-white" />
      </div>
    );

  const currentPlayer = players.find((p) => p.id === localPlayerId);
  const waitingPlayers = players.filter((p) => p.status === "WAITING");
  const acceptedPlayers = players.filter((p) => p.status === "ACCEPTED");

  if (room?.status === "PLAYING") {
    const myPairGroup = room.pairs?.find((group: any) =>
      group.players.some((p: Player) => p.id === localPlayerId),
    );

    if (!myPairGroup)
      return (
        <div className="text-white text-center mt-20">
          Assigning partners...
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
        isHost={currentPlayer?.is_host || false} // <-- NEW
        roomRound={room.round} // <-- NEW
      />
    );
  }

  // --- NEW: LOBBY CONTROLS ---
  const handleEndRoomLobby = async () => {
    setIsLoading(true); // Re-use your loading state to disable buttons
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

  // --- PLAYER VIEW ---
  if (!currentPlayer?.is_host) {
    // Player: Still in the waiting room
    if (currentPlayer?.status === "WAITING") {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
          <div className="bg-zinc-900/50 p-10 rounded-3xl border border-zinc-800 text-center flex flex-col items-center shadow-2xl">
            <Loader2 className="animate-spin mb-6 text-red-500" size={40} />
            <h2 className="text-2xl font-bold mb-2">Waiting for Host</h2>
            <p className="text-zinc-400 mb-8 text-lg">
              They are reviewing the lobby...
            </p>
            <button
              onClick={handleLeaveRoom}
              disabled={isLoading}
              className="px-8 py-3 bg-zinc-950 border border-zinc-700 text-white font-bold rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-colors shadow-lg"
            >
              Exit Room
            </button>
          </div>
        </main>
      );
    }

    // Player: Accepted into the room
    return (
      <main className="flex min-h-screen flex-col p-6 bg-zinc-950 text-white max-w-4xl mx-auto w-full">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              Room{" "}
              <span className="text-red-500 tracking-widest font-mono">
                {roomCode}
              </span>
            </h1>
            <p className="text-zinc-400 mt-1">Waiting for host to start...</p>
          </div>
          <button
            onClick={handleLeaveRoom}
            disabled={isLoading}
            className="px-6 py-3 bg-zinc-950 border border-zinc-700 text-zinc-300 font-bold rounded-xl hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
          >
            Exit Room
          </button>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-xl w-full">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Check className="text-emerald-500" size={20} /> In Room (
            {acceptedPlayers.length})
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {acceptedPlayers.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center aspect-square gap-3 shadow-inner"
              >
                {p.is_host ? (
                  <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                    <Crown className="text-yellow-500" size={24} />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                    <User className="text-zinc-400" size={24} />
                  </div>
                )}
                <div className="flex flex-col items-center">
                  <span className="font-bold text-lg text-center line-clamp-1">
                    {p.name}
                  </span>
                  {p.id === localPlayerId && (
                    <span className="text-xs text-zinc-500 font-bold tracking-wider uppercase mt-1">
                      (You)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  // --- HOST VIEW ---
  return (
    <main className="flex min-h-screen flex-col p-6 bg-zinc-950 text-white max-w-6xl mx-auto w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8 bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            Room{" "}
            <span className="text-red-500 tracking-widest font-mono">
              <RoomCodeCopy code={roomCode} />
            </span>
          </h1>
          <p className="text-zinc-400 mt-1 flex items-center gap-2">
            <Crown size={16} className="text-yellow-500" /> You are the Host
          </p>
        </div>

        <div className="flex gap-4 w-full md:w-auto">
          <button
            onClick={handleEndRoomLobby}
            disabled={isLoading}
            className="flex-1 md:flex-none px-6 py-3 bg-zinc-950 border border-zinc-700 text-zinc-300 font-bold rounded-xl hover:bg-zinc-800 hover:text-white transition-colors disabled:opacity-50"
          >
            End Room
          </button>
          <button
            onClick={handleStartGame}
            disabled={acceptedPlayers.length < 2 || isLoading}
            className="flex-1 md:flex-none px-8 py-3 bg-red-500 text-white font-bold rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
          >
            Start Game
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
        {/* Left Side: Waiting Lobby */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex flex-col shadow-xl">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users size={20} className="text-zinc-400" /> Waiting (
              {waitingPlayers.length})
            </h2>
            {waitingPlayers.length > 0 && (
              <button
                onClick={handleAcceptAll}
                className="text-sm px-4 py-2 font-bold bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                Accept All
              </button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            {waitingPlayers.length === 0 ? (
              <p className="text-zinc-500 italic text-center py-8">
                Lobby is empty
              </p>
            ) : (
              waitingPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex justify-between items-center bg-zinc-950 border border-zinc-800 p-4 rounded-xl"
                >
                  <span className="font-bold text-lg">{p.name}</span>
                  <button
                    onClick={() => handleAcceptPlayer(p.id)}
                    className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg hover:bg-emerald-500/20 transition-colors"
                  >
                    <Check size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Accepted Players */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-xl">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Check className="text-emerald-500" size={20} /> In Room (
            {acceptedPlayers.length})
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {acceptedPlayers.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center aspect-square gap-3 shadow-inner"
              >
                {p.is_host ? (
                  <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center">
                    <Crown className="text-yellow-500" size={24} />
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                    <User className="text-zinc-400" size={24} />
                  </div>
                )}
                <div className="flex flex-col items-center">
                  <span className="font-bold text-lg text-center line-clamp-1">
                    {p.name}
                  </span>
                  {p.id === localPlayerId && (
                    <span className="text-xs text-zinc-500 font-bold tracking-wider uppercase mt-1">
                      (You)
                    </span>
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
  roomRound
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
  const [phase, setPhase] = useState<
    "CHATTING" | "GUESSING" | "WAITING_GUESSES" | "REVEAL" | "WAITING"
  >("CHATTING");
  const [pointsEarned, setPointsEarned] = useState<number>(0);
  const [deceptionPoints, setDeceptionPoints] = useState<number>(0);
  const [selectedGuesses, setSelectedGuesses] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const otherPlayers = groupPlayers.filter((p) => p.id !== localPlayerId);
  const requiredGuesses = otherPlayers.length;
  
  const strangerMap = Object.fromEntries(
    otherPlayers.map((p, index) => [
      p.id,
      { name: `Stranger ${index + 1}`, color: index === 0 ? "text-blue-400" : "text-emerald-400" }
    ])
  );

  // Hook: Reset round state
  useEffect(() => {
    setPhase("CHATTING");
    setSelectedGuesses([]);
    setPointsEarned(0);
    setDeceptionPoints(0);

    // Clear previous round's guesses in the DB, but DO NOT touch the score!
    supabase
      .from("players")
      .update({ locked_guesses: null })
      .eq("id", localPlayerId);
  }, [roomRound]);

  // Hook: Chat Timer
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

    const channel = supabase.channel(`chat:${groupId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` }, 
        (payload) => setMessages((prev) => [...prev, payload.new])
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [groupId, phase]);

  // Hook: Calculate Scores when everyone has guessed
  useEffect(() => {
    if (phase !== "WAITING_GUESSES") return;

    const myGroupPlayers = allPlayers.filter((p) =>
      groupPlayers.some((gp) => gp.id === p.id),
    );

    // Check if EVERYONE has an array of guesses saved
    const everyoneGuessed = myGroupPlayers.every((p) =>
      Array.isArray(p.locked_guesses),
    );

    if (everyoneGuessed) {
      // Instantly change phase so this effect doesn't run twice
      setPhase("REVEAL");

      const calculateAndSaveScores = async () => {
        const me = myGroupPlayers.find((p) => p.id === localPlayerId);
        const others = myGroupPlayers.filter((p) => p.id !== localPlayerId);

        // --- CALCULATE DEDUCTION (Did I guess them?) ---
        const correctIds = others.map((p) => p.id);
        const myGuesses = Array.isArray(me?.locked_guesses)
          ? me.locked_guesses
          : [];
        const deductionPts = myGuesses.filter((id: string) =>
          correctIds.includes(id),
        ).length;

        // --- CALCULATE DECEPTION (Did they fail to guess me?) ---
        let deceptionPts = 0;
        others.forEach((other) => {
          const otherGuesses = Array.isArray(other.locked_guesses)
            ? other.locked_guesses
            : [];
          if (!otherGuesses.includes(localPlayerId)) {
            deceptionPts += 1;
          }
        });

        // --- UPDATE TOTAL ACCUMULATED SCORE ---
        const roundTotal = deductionPts + deceptionPts;

        if (roundTotal > 0) {
          // 🚀 FIX: Fetch the absolute latest score straight from the database
          const { data } = await supabase
            .from("players")
            .select("score")
            .eq("id", localPlayerId)
            .single();

          const absoluteCurrentScore = data?.score || 0;
          const newAccumulatedTotal = absoluteCurrentScore + roundTotal;

          // Push the new stacked total back to the database
          await supabase
            .from("players")
            .update({ score: newAccumulatedTotal })
            .eq("id", localPlayerId);
        }

        // --- TRIGGER UI REVEAL ---
        setPointsEarned(deductionPts);
        setDeceptionPoints(deceptionPts);

        if (deductionPts > 0) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ["#10b981", "#3b82f6", "#ffffff"],
          });
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
    await supabase.from("messages").insert([
      {
        room_code: roomCode,
        group_id: groupId,
        sender_id: localPlayerId,
        content,
      },
    ]);
  };

  const toggleGuess = (playerId: string) => {
    if (selectedGuesses.includes(playerId)) {
      setSelectedGuesses(prev => prev.filter(id => id !== playerId));
    } else if (selectedGuesses.length < requiredGuesses) {
      setSelectedGuesses(prev => [...prev, playerId]);
    }
  };

  // --- UPDATED SUBMIT GUESS LOGIC ---
  const submitGuess = async () => {
    setIsProcessing(true);
    await supabase
      .from("players")
      .update({ locked_guesses: selectedGuesses })
      .eq("id", localPlayerId);
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
    const shiftedPlayers = [
      playersList[0],
      ...playersList.slice(1 + shift),
      ...playersList.slice(1, 1 + shift),
    ];

    const newPairs: any[] = [];
    for (let i = 0; i < n / 2; i++) {
      const p1 = shiftedPlayers[i];
      const p2 = shiftedPlayers[n - 1 - i];
      if (p1.id !== "BYE" && p2.id !== "BYE") {
        newPairs.push({ groupId: crypto.randomUUID(), players: [p1, p2] });
      } else {
        const oddPlayer = p1.id === "BYE" ? p2 : p1;
        if (newPairs.length > 0)
          newPairs[newPairs.length - 1].players.push(oddPlayer);
        else
          newPairs.push({ groupId: crypto.randomUUID(), players: [oddPlayer] });
      }
    }

    await supabase
      .from("rooms")
      .update({
        round: roomRound + 1,
        pairs: newPairs,
        chat_ends_at: new Date(Date.now() + 30000).toISOString(),
      })
      .eq("code", roomCode);
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
    const sortedLeaderboard = [...allPlayers].sort(
      (a, b) => (b.score || 0) - (a.score || 0),
    );

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
        <h2 className="text-3xl font-bold mb-8 text-white flex items-center gap-3">
          <Crown className="text-yellow-500" /> Leaderboard
        </h2>

        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-2 mb-8 shadow-2xl flex flex-col gap-2">
          {sortedLeaderboard.map((p, index) => (
            <div
              key={p.id}
              className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800/50"
            >
              <div className="flex items-center gap-4">
                <span
                  className={`text-lg font-bold w-6 text-center ${index === 0 ? "text-yellow-500" : index === 1 ? "text-zinc-300" : index === 2 ? "text-amber-700" : "text-zinc-600"}`}
                >
                  #{index + 1}
                </span>
                <span className="font-bold text-white">
                  {p.name}{" "}
                  {p.id === localPlayerId && (
                    <span className="text-xs text-zinc-500 ml-2">(You)</span>
                  )}
                </span>
              </div>
              <span className="font-mono text-xl font-bold text-red-500">
                {p.score} pts
              </span>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="flex flex-col items-center">
            <p className="text-zinc-400 mb-6 text-center text-sm">
              Wait for everyone to lock in their guesses,
              <br />
              then start the next round or end the game.
            </p>
            <div className="flex gap-4">
              <button
                onClick={handleEndRoom}
                disabled={isProcessing}
                className="px-6 py-3 bg-zinc-800 text-white font-bold rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700 disabled:opacity-50"
              >
                End Game
              </button>
              <button
                onClick={handleNextRound}
                disabled={isProcessing}
                className="px-6 py-3 bg-white text-zinc-950 font-bold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
              >
                Start Round {roomRound + 1}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-zinc-400 text-center animate-pulse">
            Waiting for Host to start the next round...
          </p>
        )}
      </main>
    );
  }

  // --- RENDER 2: REVEAL SCREEN ---
  if (phase === "REVEAL") {
    const actualNames = otherPlayers.map((p) => p.name).join(" & ");
    const totalPoints = pointsEarned + deceptionPoints;

    const hasDeduction = pointsEarned > 0;
    const hasDeception = deceptionPoints > 0;

    let status = {
      icon: <Skull size={40} />,
      title: "",
      desc: "",
      color: "",
      bg: "",
    };

    if (hasDeduction && hasDeception) {
      status = {
        icon: <Crown size={40} />,
        title: "Double Agent!",
        desc: "You caught them and stayed completely hidden.",
        color: "text-purple-400",
        bg: "bg-purple-500/20 border-purple-500/30",
      };
    } else if (hasDeduction && !hasDeception) {
      status = {
        icon: <Eye size={40} />,
        title: "Dead-On!",
        desc: "You saw right through their disguise.",
        color: "text-emerald-400",
        bg: "bg-emerald-500/20 border-emerald-500/30",
      };
    } else if (!hasDeduction && hasDeception) {
      status = {
        icon: <Ghost size={40} />,
        title: "Deceptive!",
        desc: "You missed them, but your cover remained intact.",
        color: "text-blue-400",
        bg: "bg-blue-500/20 border-blue-500/30",
      };
    } else {
      status = {
        icon: <Skull size={40} />,
        title: "Duped!",
        desc: "You were fooled, and they saw right through you.",
        color: "text-red-500",
        bg: "bg-red-500/20 border-red-500/30",
      };
    }

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white text-center">
        <div
          className={`w-full max-w-lg bg-zinc-900 border ${status.bg} p-10 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-300 transition-colors`}
        >
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${status.bg} ${status.color}`}
          >
            {status.icon}
          </div>
          <h2 className={`text-4xl font-bold mb-2 ${status.color}`}>
            {status.title}
          </h2>
          <p className="text-zinc-400 text-lg mb-8">{status.desc}</p>

          <div className="grid grid-cols-3 gap-4 w-full mb-8">
            <div className="bg-zinc-950 p-4 rounded-xl border border-emerald-500/30 flex flex-col items-center justify-center">
              <p className="text-xs text-zinc-500 uppercase font-bold mb-1">
                Deduction
              </p>
              <p className="text-2xl font-bold text-emerald-400">
                +{pointsEarned}
              </p>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-blue-500/30 flex flex-col items-center justify-center">
              <p className="text-xs text-zinc-500 uppercase font-bold mb-1">
                Deception
              </p>
              <p className="text-2xl font-bold text-blue-400">
                +{deceptionPoints}
              </p>
            </div>
            <div className="bg-zinc-950 p-4 rounded-xl border border-white/20 flex flex-col items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.05)]">
              <p className="text-xs text-zinc-500 uppercase font-bold mb-1">
                Total
              </p>
              <p className="text-2xl font-bold text-white">+{totalPoints}</p>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 w-full p-6 rounded-xl mb-8">
            <p className="text-sm text-zinc-500 uppercase tracking-widest font-bold mb-2">
              Target Identity Revealed:
            </p>
            <p className="text-2xl font-bold text-white">{actualNames}</p>
          </div>

          <button
            onClick={() => setPhase("WAITING")}
            className="w-full py-4 bg-white text-zinc-950 font-bold rounded-xl hover:bg-zinc-200 transition-colors shadow-lg"
          >
            Continue to Lobby
          </button>
        </div>
      </main>
    );
  }

  // --- RENDER 3: WAITING FOR OPPONENTS TO GUESS ---
  // (This is the block you accidentally deleted!)
  if (phase === "WAITING_GUESSES") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white text-center">
        <div className="w-full max-w-lg bg-zinc-900/50 border border-zinc-800 p-10 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200">
          <Loader2 className="animate-spin text-emerald-500 mb-6" size={48} />
          <h2 className="text-3xl font-bold text-white mb-2">Guess Locked!</h2>
          <p className="text-zinc-400 text-lg">
            Waiting for your opponents to finish guessing...
          </p>
        </div>
      </main>
    );
  }

  // --- RENDER 4: GUESSING ---
  if (phase === "GUESSING") {
    const guessablePlayers = allPlayers.filter(p => p.id !== localPlayerId);

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
        <h2 className="text-4xl font-bold mb-2 text-white">
          Who were you talking to?
        </h2>
        <p className="text-zinc-400 mb-8">
          Select <span className="font-bold text-white">{requiredGuesses}</span>{" "}
          player{requiredGuesses > 1 ? "s" : ""} from the list below.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-2xl mb-8">
          {guessablePlayers.map(p => {
            const isSelected = selectedGuesses.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => toggleGuess(p.id)}
                className={`p-4 rounded-xl font-bold transition-all border-2 ${isSelected ? "bg-zinc-100 text-zinc-950 border-zinc-100 scale-105" : "bg-zinc-900 text-white border-zinc-700 hover:border-zinc-500"}`}
              >
                {p.name}
              </button>
            );
          })}
        </div>
        <button
          onClick={submitGuess}
          disabled={selectedGuesses.length !== requiredGuesses}
          className="bg-red-500 text-white px-8 py-4 font-bold rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors"
        >
          Lock in Guess
        </button>
      </main>
    );
  }

  // --- RENDER 5: CHATTING (Default Fallback) ---
  return (
    // ... (Your exact chatting UI return block here)
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
      <div className="flex justify-between w-full max-w-2xl mb-4 items-end">
        <div>
          <h1 className="text-3xl font-bold text-red-500 animate-pulse">Secret Chat</h1>
          <p className="text-zinc-400">Chatting with {otherPlayers.length} stranger{otherPlayers.length > 1 ? "s" : ""}</p>
        </div>
        <div className={`text-4xl font-mono font-bold ${timeLeft <= 10 ? "text-red-500" : "text-white"}`}>
          00:{timeLeft.toString().padStart(2, '0')}
        </div>
      </div>
      
      <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 h-[500px] rounded-2xl flex flex-col p-4 shadow-2xl">
        <div className="flex-1 border-b border-zinc-800 mb-4 overflow-y-auto p-2 flex flex-col gap-4">
          {messages.length === 0 ? (
            <p className="text-zinc-500 text-center text-sm mt-4">Breakout room created. Start typing!</p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === localPlayerId;
              const strangerInfo = strangerMap[msg.sender_id];
              return (
                <div key={msg.id} className={`flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && strangerInfo && (
                    <span className={`text-xs font-bold px-1 tracking-wider uppercase ${strangerInfo.color}`}>
                      {strangerInfo.name}
                    </span>
                  )}
                  <div className={`px-4 py-3 max-w-[80%] shadow-md ${isMe ? "bg-zinc-100 text-zinc-950 rounded-2xl rounded-br-sm font-medium" : "bg-zinc-800 text-white border border-zinc-700 rounded-2xl rounded-bl-sm"}`}>
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
            placeholder="Send an anonymous message..." 
            className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-4 py-3 focus:outline-none focus:border-zinc-400 transition-colors"
            autoComplete="off"
          />
          <button type="submit" disabled={!newMessage.trim()} className="bg-white text-zinc-950 px-6 font-bold rounded-lg hover:bg-zinc-200 disabled:opacity-50 transition-colors">
            Send
          </button>
        </form>
      </div>
    </main>
  );
}
