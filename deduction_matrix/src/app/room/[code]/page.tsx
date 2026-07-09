"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Crown, User, Check, Users, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import { PartyPopper, Ghost } from "lucide-react";

type Player = {
  id: string;
  name: string;
  is_host: boolean;
  status: "WAITING" | "ACCEPTED";
};

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
      // 1. The Players Listener (prevents duplicate tiles)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_code=eq.${roomCode}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setPlayers((prev) => {
              if (prev.some((p) => p.id === payload.new.id)) return prev;
              return [...prev, payload.new as Player];
            });
          }
          if (payload.eventType === "UPDATE") {
            setPlayers((prev) =>
              prev.map((p) =>
                p.id === payload.new.id ? (payload.new as Player) : p,
              ),
            );
          }
          if (payload.eventType === "DELETE") {
            setPlayers((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        },
      )
      // 2. The Rooms Listener (forces fresh data sync so you don't have to refresh)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rooms", filter: `code=eq.${roomCode}` },
        async () => {
          const { data } = await supabase.from("rooms").select("*").eq("code", roomCode).single();
          if (data) setRoom(data);
        }
      )
      // --- ADD THIS DELETE LISTENER ---
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "rooms", filter: `code=eq.${roomCode}` },
        () => {
          window.location.href = "/"; // Instantly kicks everyone to the home page
        }
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

  // --- PLAYER VIEW ---
  if (!currentPlayer?.is_host) {
    if (currentPlayer?.status === "WAITING") {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
          <div className="bg-zinc-900 p-8 rounded-2xl border border-zinc-800 text-center flex flex-col items-center">
            <Loader2 className="animate-spin mb-4 text-zinc-400" size={32} />
            <h2 className="text-xl font-bold">Waiting for Host</h2>
            <p className="text-zinc-400 mt-2">
              They are reviewing the lobby...
            </p>
          </div>
        </main>
      );
    }

    return (
      <main className="flex min-h-screen flex-col items-center p-6 bg-zinc-950 text-white">
        <h1 className="text-3xl font-bold mb-8">Room: {roomCode}</h1>
        <div className="w-full max-w-2xl grid grid-cols-2 md:grid-cols-3 gap-4">
          {acceptedPlayers.map((p) => (
            <div
              key={p.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center aspect-square gap-2"
            >
              {p.is_host ? (
                <Crown className="text-yellow-500" />
              ) : (
                <User className="text-zinc-400" />
              )}
              <span className="font-bold">{p.name}</span>
              {p.id === localPlayerId && (
                <span className="text-xs text-zinc-500">(You)</span>
              )}
            </div>
          ))}
        </div>
      </main>
    );
  }

  // --- HOST VIEW ---
  return (
    <main className="flex min-h-screen flex-col p-6 bg-zinc-950 text-white">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Room: {roomCode}</h1>
          <p className="text-zinc-400">You are the Host</p>
        </div>
        <button
          onClick={handleStartGame}
          disabled={acceptedPlayers.length < 2}
          className="px-6 py-3 bg-white text-zinc-950 font-bold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          Start Game
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 flex-1">
        {/* Left Side: Waiting Lobby */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users size={20} /> Waiting ({waitingPlayers.length})
            </h2>
            {waitingPlayers.length > 0 && (
              <button
                onClick={handleAcceptAll}
                className="text-sm px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-md"
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
                  className="flex justify-between items-center bg-zinc-900 border border-zinc-700 p-4 rounded-xl"
                >
                  <span className="font-medium">{p.name}</span>
                  <button
                    onClick={() => handleAcceptPlayer(p.id)}
                    className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                  >
                    <Check size={18} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Accepted Players */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
          <h2 className="text-xl font-bold mb-6">
            In Room ({acceptedPlayers.length})
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {acceptedPlayers.map((p) => (
              <div
                key={p.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center aspect-square gap-2"
              >
                {p.is_host ? (
                  <Crown className="text-yellow-500" />
                ) : (
                  <User className="text-zinc-400" />
                )}
                <span className="font-bold">{p.name}</span>
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
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  
  // --- ADDED REVEAL PHASE & POINTS STATE ---
  const [phase, setPhase] = useState<"CHATTING" | "GUESSING" | "REVEAL" | "WAITING">("CHATTING");
  const [pointsEarned, setPointsEarned] = useState<number>(0);
  
  const [selectedGuesses, setSelectedGuesses] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setPhase("CHATTING");
    setSelectedGuesses([]);
    setPointsEarned(0);
  }, [roomRound]);

  const otherPlayers = groupPlayers.filter(p => p.id !== localPlayerId);
  const requiredGuesses = otherPlayers.length;
  
  const strangerMap = Object.fromEntries(
    otherPlayers.map((p, index) => [
      p.id,
      { name: `Stranger ${index + 1}`, color: index === 0 ? "text-blue-400" : "text-emerald-400" }
    ])
  );

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

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || phase !== "CHATTING") return;
    const content = newMessage.trim();
    setNewMessage(""); 
    await supabase.from("messages").insert([{ room_code: roomCode, group_id: groupId, sender_id: localPlayerId, content }]);
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
    const correctIds = otherPlayers.map(p => p.id);
    const correctCount = selectedGuesses.filter(id => correctIds.includes(id)).length;

    setPointsEarned(correctCount);

    if (correctCount > 0) {
      const { data } = await supabase.from("players").select("score").eq("id", localPlayerId).single();
      const newScore = (data?.score || 0) + correctCount;
      await supabase.from("players").update({ score: newScore }).eq("id", localPlayerId);
      
      // Fire confetti if they got at least one right!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#ffffff'] // Emerald, Blue, White to match the matrix theme
      });
    }
    
    // Move to REVEAL screen instead of WAITING
    setPhase("REVEAL");
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

    await supabase.from("rooms").update({ 
      round: roomRound + 1,
      pairs: newPairs,
      chat_ends_at: new Date(Date.now() + 30000).toISOString()
    }).eq("code", roomCode);
    setIsProcessing(false);
  };

  const handleEndRoom = async () => {
    setIsProcessing(true);
    await supabase.from("rooms").delete().eq("code", roomCode);
    window.location.href = "/"; 
  };


  // --- 1. RENDER WAITING (Leaderboard) ---
  if (phase === "WAITING") {
    const sortedLeaderboard = [...allPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
        <h2 className="text-3xl font-bold mb-8 text-white flex items-center gap-3">
          <Crown className="text-yellow-500" /> Leaderboard
        </h2>
        
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-2 mb-8 shadow-2xl flex flex-col gap-2">
          {sortedLeaderboard.map((p, index) => (
            <div key={p.id} className="flex items-center justify-between p-4 bg-zinc-950 rounded-xl border border-zinc-800/50">
              <div className="flex items-center gap-4">
                <span className={`text-lg font-bold w-6 text-center ${index === 0 ? "text-yellow-500" : index === 1 ? "text-zinc-300" : index === 2 ? "text-amber-700" : "text-zinc-600"}`}>
                  #{index + 1}
                </span>
                <span className="font-bold text-white">{p.name} {p.id === localPlayerId && <span className="text-xs text-zinc-500 ml-2">(You)</span>}</span>
              </div>
              <span className="font-mono text-xl font-bold text-red-500">{p.score} pts</span>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="flex flex-col items-center">
            <p className="text-zinc-400 mb-6 text-center text-sm">Wait for everyone to lock in their guesses,<br/>then start the next round or end the game.</p>
            <div className="flex gap-4">
              <button onClick={handleEndRoom} disabled={isProcessing} className="px-6 py-3 bg-zinc-800 text-white font-bold rounded-lg hover:bg-zinc-700 transition-colors border border-zinc-700 disabled:opacity-50">
                End Game
              </button>
              <button onClick={handleNextRound} disabled={isProcessing} className="px-6 py-3 bg-white text-zinc-950 font-bold rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50">
                Start Round {roomRound + 1}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-zinc-400 text-center animate-pulse">Waiting for Host to start the next round...</p>
        )}
      </main>
    );
  }

  // --- 2. RENDER REVEAL SCREEN ---
  if (phase === "REVEAL") {
    const isPerfect = pointsEarned === requiredGuesses;
    const actualNames = otherPlayers.map(p => p.name).join(" & ");

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white text-center">
        <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 p-10 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-300">
          
          {isPerfect ? (
            <>
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 text-emerald-400">
                <PartyPopper size={40} />
              </div>
              <h2 className="text-4xl font-bold text-emerald-400 mb-2">Perfect Deduction!</h2>
              <p className="text-zinc-400 text-lg mb-8">You saw right through their disguise.</p>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 text-red-500">
                <Ghost size={40} />
              </div>
              <h2 className="text-4xl font-bold text-red-500 mb-2">Fooled!</h2>
              <p className="text-zinc-400 text-lg mb-8">They slipped right past you.</p>
            </>
          )}

          <div className="bg-zinc-950 border border-zinc-800 w-full p-6 rounded-xl mb-8">
            <p className="text-sm text-zinc-500 uppercase tracking-widest font-bold mb-2">Target Identity Revealed:</p>
            <p className="text-2xl font-bold text-white">{actualNames}</p>
          </div>

          <p className="text-xl font-bold mb-8">
            Earned: <span className={pointsEarned > 0 ? "text-emerald-400" : "text-zinc-500"}>+{pointsEarned} Points</span>
          </p>

          <button 
            onClick={() => setPhase("WAITING")}
            className="w-full py-4 bg-white text-zinc-950 font-bold rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Continue to Lobby
          </button>
        </div>
      </main>
    );
  }

  // --- 3. RENDER GUESSING ---
  if (phase === "GUESSING") {
    const guessablePlayers = allPlayers.filter(p => p.id !== localPlayerId);

    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-zinc-950 text-white">
        <h2 className="text-4xl font-bold mb-2 text-white">Who were you talking to?</h2>
        <p className="text-zinc-400 mb-8">Select <span className="font-bold text-white">{requiredGuesses}</span> player{requiredGuesses > 1 ? "s" : ""} from the list below.</p>
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
        <button onClick={submitGuess} disabled={selectedGuesses.length !== requiredGuesses} className="bg-red-500 text-white px-8 py-4 font-bold rounded-xl hover:bg-red-600 disabled:opacity-50 transition-colors">
          Lock in Guess
        </button>
      </main>
    );
  }

  // --- 4. RENDER CHATTING ---
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
