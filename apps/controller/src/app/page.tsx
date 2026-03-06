"use client";
import { useState, useEffect } from "react";
import { socket } from "../lib/socket";

export default function ControllerApp() {
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [gameState, setGameState] = useState("LOBBY");

  const [score, setScore] = useState(1000);
  const [wagerPercentage, setWagerPercentage] = useState(0);
  const [minWagerPercentage, setMinWagerPercentage] = useState(10);
  const [wagerLocked, setWagerLocked] = useState(false);

  const [answerLocked, setAnswerLocked] = useState(false);
  const [wonSlayerBonus, setWonSlayerBonus] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState<number | null>(null);

  const [endTime, setEndTime] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!endTime) {
      setTimeLeft(null);
      return;
    }
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [endTime]);

  useEffect(() => {
    const savedRoomCode = localStorage.getItem("volatility_roomCode");
    const savedPlayerId = localStorage.getItem("volatility_playerId");
    const savedPlayerName = localStorage.getItem("volatility_playerName");

    if (savedRoomCode && savedPlayerId && savedPlayerName) {
      socket.emit("reconnectPlayer", { roomCode: savedRoomCode, playerId: savedPlayerId }, (res: any) => {
        if (res.success) {
          setRoomCode(savedRoomCode);
          setPlayerName(savedPlayerName);
          setJoined(true);
          const rs = res.roomState;
          if (rs) {
            setGameState(rs.state);
            const myPlayer = Object.values(rs.players).find((p: any) => p.id === savedPlayerId) as any;
            if (myPlayer) {
              setScore(myPlayer.score);
              setIsCorrect(myPlayer.isCorrect);
              if (rs.state === "WAGER_PERIOD") {
                setWagerLocked(myPlayer.hasWagered);
                setMinWagerPercentage(rs.currentMinWagerPercentage || 10);
                setWagerPercentage(myPlayer.hasWagered ? Math.floor((myPlayer.currentWager / myPlayer.score) * 100) : (rs.currentMinWagerPercentage || 10));
              }
              if (rs.state === "QUESTION_LIVE") {
                setAnswerLocked(myPlayer.hasAnswered);
              }
            }
          }
        } else {
          localStorage.removeItem("volatility_roomCode");
          localStorage.removeItem("volatility_playerId");
          localStorage.removeItem("volatility_playerName");
        }
      });
    }

    socket.on("stateChanged", (data) => {
      setGameState(data.newState);
      if (data.endTime) {
        setEndTime(data.endTime);
      } else {
        setEndTime(null);
        setTimeLeft(null);
      }

      if (data.players) {
        const myPlayer = Object.values(data.players).find((p: any) => p.socketId === socket.id) as any;
        if (myPlayer) {
          setScore(myPlayer.score);
          setIsCorrect(myPlayer.isCorrect);
        }
      }

      if (data.newState === "CATEGORY_REVEAL") {
        setIsCorrect(null);
        if (data.questionData) {
          setCurrentCategory(data.questionData.category);
          setCurrentMultiplier(data.questionData.multiplier);
        }
      }
      if (data.newState === "WAGER_PERIOD") {
        setWagerLocked(false);
        const minWag = data.minWagerPercentage || 10;
        setMinWagerPercentage(minWag);
        setWagerPercentage(minWag);
      }
      if (data.newState === "QUESTION_LIVE") {
        setAnswerLocked(false);
        setCurrentOptions(data.options || []);
      }
    });

    socket.on("resultsCalculated", (data) => {
      setGameState("RESULTS");
      // Find my updated score
      const myPlayer = Object.values(data.players).find((p: any) => p.socketId === socket.id) as any;
      if (myPlayer) {
        setScore(myPlayer.score);
        setIsCorrect(myPlayer.isCorrect);
      }

      if (data.slayerBonusApplied && myPlayer && data.slayerBonusWinner === myPlayer.id) {
        setWonSlayerBonus(true);
      } else {
        setWonSlayerBonus(false);
      }
    });

    return () => {
      socket.off("stateChanged");
      socket.off("resultsCalculated");
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length !== 4 || !playerName) return;

    socket.emit("joinRoom", { roomCode: roomCode.toUpperCase(), playerName }, (res: any) => {
      if (res.success && res.playerId) {
        setJoined(true);
        localStorage.setItem("volatility_roomCode", roomCode.toUpperCase());
        localStorage.setItem("volatility_playerId", res.playerId);
        localStorage.setItem("volatility_playerName", playerName);
      } else {
        alert("Room not found!");
      }
    });
  };

  const handleWager = () => {
    const wagerAmount = wagerPercentage === 100 ? score : Math.max(1, Math.floor(score * (wagerPercentage / 100)));
    socket.emit("submitWager", { roomCode: roomCode.toUpperCase(), wager: wagerAmount }, (res: any) => {
      if (res.success) setWagerLocked(true);
    });
  };

  const submitAnswer = (answerText: string) => {
    socket.emit("submitAnswer", { roomCode: roomCode.toUpperCase(), answer: answerText }, (res: any) => {
      if (res.success) setAnswerLocked(true);
    });
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-center p-6">
        <h1 className="text-3xl font-black text-cyan-400 uppercase tracking-widest mb-10 text-center">Investor Portal</h1>

        <form onSubmit={handleJoin} className="w-full max-w-sm flex flex-col gap-6">
          <div>
            <label className="text-sm text-gray-400 uppercase tracking-wider">Room Code</label>
            <input
              type="text"
              maxLength={4}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              className="w-full bg-gray-900 border-2 border-gray-700 text-center text-4xl p-4 tracking-[1em] font-bold outline-none focus:border-cyan-400 transition-colors uppercase"
              placeholder="----"
              required
            />
          </div>

          <div>
            <label className="text-sm text-gray-400 uppercase tracking-wider">Your Alias</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
              className="w-full bg-gray-900 border-2 border-gray-700 text-center text-2xl p-4 font-bold outline-none focus:border-cyan-400 transition-colors uppercase"
              placeholder="PLAYER 1"
              required
            />
          </div>

          <button type="submit" className="w-full bg-cyan-600 hover:bg-cyan-500 text-black font-black text-xl py-4 mt-4 tracking-widest uppercase transition-colors">
            Connect
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`min-h-screen text-white font-mono flex flex-col transition-colors duration-1000 ${gameState === "RESULTS" && isCorrect === true ? "bg-green-900" :
      gameState === "RESULTS" && isCorrect === false ? "bg-red-900" :
        "bg-black"
      }`}>
      {/* HEADER */}
      <header className="flex justify-between items-center p-4 bg-gray-900 border-b-2 border-cyan-500">
        <div className="font-bold text-gray-400 uppercase truncate max-w-[50%]">{playerName}</div>
        <div className="text-xl font-black text-green-400">${score}</div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col p-6 items-center justify-center">
        {gameState === "LOBBY" && (
          <div className="text-center">
            <h2 className="text-2xl text-cyan-400 animate-pulse uppercase tracking-widest">
              Connected
            </h2>
            <p className="text-gray-500 mt-4 leading-relaxed max-w-xs mx-auto">
              Look at the main screen. The market will open shortly.
            </p>
          </div>
        )}

        {gameState === "CATEGORY_REVEAL" && (
          <div className="w-full max-w-sm flex flex-col gap-6 text-center">
            <h2 className="text-xl text-gray-400 uppercase tracking-widest animate-pulse">
              Incoming Sector
            </h2>
            <div className="text-3xl font-black text-white uppercase break-words border-2 border-cyan-800 bg-gray-900 p-6 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              {currentCategory || "Unknown"}
            </div>
            {currentMultiplier && (
              <div className="text-2xl font-bold text-red-500 mt-2">
                Multiplier: {currentMultiplier}x
              </div>
            )}
            <p className="text-gray-500 mt-4 text-sm uppercase tracking-widest">Prepare your wagers...</p>
          </div>
        )}

        {gameState === "WAGER_PERIOD" && (
          <div className="w-full max-w-sm flex flex-col gap-8">
            {score <= 0 ? (
              <div className="text-center">
                <h2 className="text-4xl font-black text-red-500 uppercase tracking-widest mt-10">Bankrupt</h2>
                <p className="text-gray-400 mt-4">You have been eliminated from trading.</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center px-2">
                  <h2 className="text-2xl font-black text-cyan-400 uppercase tracking-widest">Place Your Wager</h2>
                  {timeLeft !== null && <span className={`text-2xl font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>00:{timeLeft.toString().padStart(2, '0')}</span>}
                </div>

                <div className="text-center font-black text-5xl text-white">
                  {wagerPercentage}%
                </div>
                <div className="text-center text-green-400 font-bold">
                  Risking: ${wagerPercentage === 100 ? score : Math.max(1, Math.floor(score * (wagerPercentage / 100)))} <span className="text-gray-500 text-sm">(Min: {minWagerPercentage}%)</span>
                </div>

                <input
                  type="range"
                  min={minWagerPercentage}
                  max="100"
                  value={wagerPercentage}
                  onChange={(e) => setWagerPercentage(Number(e.target.value))}
                  disabled={wagerLocked}
                  className="w-full h-4 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />

                <button
                  onClick={handleWager}
                  disabled={wagerLocked}
                  className={`w-full py-5 text-xl font-black uppercase tracking-widest ${wagerLocked ? "bg-gray-800 text-gray-500" : "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]"}`}
                >
                  {wagerLocked ? "Wager Locked" : "Lock Wager"}
                </button>
              </>
            )}
          </div>
        )}

        {gameState === "QUESTION_LIVE" && (
          <div className="w-full flex-1 flex flex-col gap-4">
            {score <= 0 ? (
              <div className="text-center mt-10">
                <h2 className="text-4xl font-black text-red-500 uppercase tracking-widest">Spectating</h2>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4 border-b-2 border-dashed border-gray-600 pb-2">
                  <h2 className="text-xl font-bold text-gray-400 uppercase tracking-widest">Select Answer</h2>
                  {timeLeft !== null && <span className={`text-2xl font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>00:{timeLeft.toString().padStart(2, '0')}</span>}
                </div>

                {/* Dynamic Options */}
                {currentOptions.map((opt: string, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => submitAnswer(opt)}
                    disabled={answerLocked}
                    className={`flex-1 min-h-[80px] p-2 text-xl font-bold border-2 border-gray-700 transition-colors ${answerLocked ? 'bg-gray-900 text-gray-600' : 'bg-gray-800 text-white hover:bg-cyan-900 hover:border-cyan-500 active:bg-cyan-500'}`}
                  >
                    {opt}
                  </button>
                ))}
                {answerLocked && <div className="text-center text-cyan-400 mt-4 animate-pulse">Answer Submitted</div>}
              </>
            )}
          </div>
        )}

        {gameState === "RESULTS" && (
          <div className="text-center w-full max-w-sm flex flex-col items-center">
            <h2 className="text-3xl font-black text-cyan-400 uppercase mb-4">Market Closed</h2>
            <p className="text-gray-400 mb-8">Review the main screen for volatility impacts.</p>
            <div className={`text-6xl font-black text-white mb-12 border-b-4 pb-4 ${isCorrect ? 'border-green-400' : isCorrect === false ? 'border-red-500' : 'border-gray-500'}`}>${score}</div>

            {wonSlayerBonus && (
              <div className="p-6 w-full bg-red-900/40 border-4 border-red-500 rounded-xl animate-[pulse_1s_infinite] shadow-[0_0_30px_rgba(220,38,38,0.6)]">
                <h3 className="text-4xl font-black text-red-500 uppercase tracking-widest mb-4" style={{ textShadow: "0 0 20px #ef4444" }}>Slayer Bonus!</h3>
                <p className="text-white text-lg font-bold">You were the ONLY investor to call this correctly. Payout doubled.</p>
              </div>
            )}
          </div>
        )}

        {gameState === "GAME_OVER" && (
          <div className="text-center">
            <h2 className="text-4xl font-black text-yellow-400 uppercase tracking-widest mt-10">Game Over</h2>
            <p className="text-gray-400 mt-4 leading-relaxed max-w-xs mx-auto">Check the main screen for the final standings!</p>
          </div>
        )}
      </main>
    </div>
  );
}
