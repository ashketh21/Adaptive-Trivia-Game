/* eslint-disable */
"use client";
import { useState, useEffect, useRef } from "react";
import { socket } from "../lib/socket";

export default function ControllerApp() {
  const [roomCode, setRoomCode] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [isSpectator, setIsSpectator] = useState(false);
  const [gameState, setGameState] = useState("LOBBY");

  const isSpectatorRef = useRef(isSpectator);
  const roomCodeRef = useRef(roomCode);
  const playerNameRef = useRef(playerName);

  useEffect(() => {
    isSpectatorRef.current = isSpectator;
    roomCodeRef.current = roomCode;
    playerNameRef.current = playerName;
  }, [isSpectator, roomCode, playerName]);

  // Phase 5 Automation State
  const [score, setScore] = useState(1000);
  const [wagerPercentage, setWagerPercentage] = useState(0);
  const [minWagerPercentage, setMinWagerPercentage] = useState(10);
  const [wagerLocked, setWagerLocked] = useState(false);
  const [isAllIn, setIsAllIn] = useState(false);

  const [answerLocked, setAnswerLocked] = useState(false);
  const [wonSlayerBonus, setWonSlayerBonus] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState<number | null>(null);

  const [questionProgress, setQuestionProgress] = useState<{ current: number, total: number, survivorRound: number }>({ current: 0, total: 0, survivorRound: 0 });
  const [survivorFloorAmount, setSurvivorFloorAmount] = useState<number>(0);

  const [isTie, setIsTie] = useState<boolean>(false);
  const [isWinner, setIsWinner] = useState<boolean>(false);

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
          if (res.spectator) {
            setIsSpectator(true);
          }
          const rs = res.roomState;
          if (rs) {
            setGameState(rs.state);
            setCurrentMultiplier(rs.currentMultiplier);
            if (rs.questionQueue && rs.questionQueue[rs.currentQuestionIndex]) {
              setCurrentCategory(rs.questionQueue[rs.currentQuestionIndex].category.name);
            }
            if (rs.totalQuestions !== undefined) {
              setQuestionProgress({ current: rs.currentQuestionIndex + 1, total: rs.totalQuestions, survivorRound: rs.survivorRound || 0 });
            }
            const myPlayer = Object.values(rs.players).find((p: any) => p.id === savedPlayerId) as any;
            if (myPlayer) {
              setScore(myPlayer.score);
              setIsCorrect(myPlayer.isCorrect);
              if (rs.state === "WAGER_PERIOD") {
                setWagerLocked(myPlayer.hasWagered);
                setIsAllIn(myPlayer.isAllIn);
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

    socket.on("kicked", () => {
      setJoined(false);
      localStorage.removeItem("volatility_roomCode");
      localStorage.removeItem("volatility_playerId");
      localStorage.removeItem("volatility_playerName");
      alert("You have been kicked from the lobby.");
    });

    socket.on("stateChanged", (data) => {
      setGameState(data.newState);
      if (data.endTime) {
        setEndTime(data.endTime);
      } else {
        setEndTime(null);
        setTimeLeft(null);
      }

      if (data.newState === "LOBBY" && isSpectatorRef.current && roomCodeRef.current && playerNameRef.current) {
        // Auto-join from spectator
        socket.emit("joinRoom", { roomCode: roomCodeRef.current, playerName: playerNameRef.current }, (res: any) => {
          if (res.success && !res.spectator) {
            setIsSpectator(false);
            if (res.playerId) localStorage.setItem("volatility_playerId", res.playerId);
          }
        });
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
        setIsAllIn(false);
        setQuestionProgress({ current: data.currentQuestionIndex + 1, total: data.totalQuestions, survivorRound: data.survivorRound });
        setSurvivorFloorAmount(data.survivorFloorAmount || 0);
        if (data.questionData) {
          setCurrentCategory(data.questionData.category);
          setCurrentMultiplier(data.questionData.multiplier);
        }
      }
      if (data.newState === "WAGER_PERIOD") {
        setWagerLocked(false);
        setIsAllIn(false);
        const minWag = data.minWagerPercentage || 10;
        setMinWagerPercentage(minWag);
        setWagerPercentage(minWag);
      }
      if (data.newState === "QUESTION_LIVE") {
        setAnswerLocked(false);
        setCurrentOptions(data.options || []);
      }

      if (data.newState === "GAME_OVER" && data.players) {
        setIsCorrect(null);
        const sorted = Object.values(data.players) as any[];
        sorted.sort((a, b) => b.score - a.score);
        const hasPositive = sorted.some(p => p.score > 0);
        const candidates = hasPositive ? sorted.filter(p => p.score > 0) : sorted;
        const topScore = candidates[0]?.score ?? 0;
        const topPlayers = candidates.filter(p => p.score === topScore);

        setIsTie(topPlayers.length > 1 && topPlayers.length > 0);
        setIsWinner(topPlayers.some(p => p.socketId === socket.id));
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
      socket.off("kicked");
      socket.off("stateChanged");
      socket.off("resultsCalculated");
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomCode.length !== 4 || !playerName) return;

    socket.emit("joinRoom", { roomCode: roomCode.toUpperCase(), playerName }, (res: any) => {
      if (res.success) {
        setJoined(true);
        if (res.spectator) {
          setIsSpectator(true);
          // Don't save to localStorage if spectator
          const rs = res.roomState;
          if (rs) {
            setGameState(rs.state);
            setCurrentMultiplier(rs.currentMultiplier);
            if (rs.questionQueue && rs.questionQueue[rs.currentQuestionIndex]) {
              setCurrentCategory(rs.questionQueue[rs.currentQuestionIndex].category.name);
            }
            if (rs.totalQuestions !== undefined) {
              setQuestionProgress({ current: rs.currentQuestionIndex + 1, total: rs.totalQuestions, survivorRound: rs.survivorRound || 0 });
            }
          }
        } else if (res.playerId) {
          localStorage.setItem("volatility_roomCode", roomCode.toUpperCase());
          localStorage.setItem("volatility_playerId", res.playerId);
          localStorage.setItem("volatility_playerName", playerName);
        }
      } else {
        alert("Room not found!");
      }
    });
  };

  const handleWager = (allIn: boolean = false) => {
    const wagerAmount = allIn ? score * 2 : (wagerPercentage === 99 ? Math.floor(score * 0.99) : Math.max(1, Math.floor(score * (wagerPercentage / 100))));
    socket.emit("submitWager", { roomCode: roomCode.toUpperCase(), wager: wagerAmount }, (res: any) => {
      if (res.success) {
        setWagerLocked(true);
        if (allIn) setIsAllIn(true);
      }
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
        <div className="flex flex-col">
          <div className="font-bold text-gray-400 uppercase truncate max-w-[150px] text-sm">{playerName}</div>
          {gameState !== "LOBBY" && gameState !== "GAME_OVER" && questionProgress.total > 0 && (
            <div className="text-xs text-cyan-500 font-bold uppercase tracking-widest mt-1">
              {questionProgress.survivorRound > 0 ? `ROUND ${questionProgress.survivorRound}` : `Q ${questionProgress.current} / ${questionProgress.total}`}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end">
          {isSpectator && <span className="text-xs text-gray-500 uppercase font-black tracking-widest">Spectator</span>}
          <div className={`text-xl font-black ${score <= 0 ? 'text-red-500' : 'text-green-400'}`}>${score}</div>
        </div>
      </header>

      {/* CONTENT */}
      <main className="flex-1 flex flex-col p-6 items-center justify-center">
        {gameState === "LOBBY" && (
          <div className="text-center">
            {isSpectator && <div className="mb-4 inline-block px-4 py-1 bg-gray-800 text-gray-400 rounded-full text-sm font-bold tracking-widest uppercase">Spectator Mode</div>}
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
            {isSpectator ? (
              <div className="text-center">
                <h2 className="text-3xl font-black text-gray-500 uppercase tracking-widest mt-10">Spectating Game</h2>
                <p className="text-gray-400 mt-4">Waiting for players to lock wagers.</p>
              </div>
            ) : score <= 0 ? (
              <div className="text-center">
                <h2 className="text-4xl font-black text-red-500 uppercase tracking-widest mt-10">Bankrupt</h2>
                <p className="text-gray-400 mt-4">You have been eliminated from trading.</p>
              </div>
            ) : (
              <>
                <div className="bg-gray-900/80 px-4 py-2 rounded-lg border border-gray-700 mb-2 flex flex-col items-center">
                  <span className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Current Sector</span>
                  <div className="text-center w-full truncate text-cyan-400 font-bold uppercase text-lg">{currentCategory}</div>
                  <div className="text-sm text-red-500 font-black tracking-widest mt-1">{currentMultiplier}x MULTIPLIER</div>
                </div>

                {survivorFloorAmount > 0 && (
                  <div className="bg-red-950/60 border border-red-500/50 p-3 rounded-lg mb-2 text-center animate-pulse">
                    <div className="text-red-400 text-xs font-black uppercase tracking-widest mb-1">Survivor Squeeze Warning</div>
                    <div className="text-white text-md font-bold">You will be eliminated if your total balance falls below <span className="text-yellow-400">${survivorFloorAmount}</span> at the start of the next round.</div>
                  </div>
                )}

                <div className="flex justify-between items-center px-2">
                  <h2 className="text-2xl font-black text-cyan-400 uppercase tracking-widest">Wager</h2>
                  {timeLeft !== null && <span className={`text-2xl font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-yellow-400'}`}>00:{timeLeft.toString().padStart(2, '0')}</span>}
                </div>

                {!isAllIn ? (
                  <>
                    <div className="text-center font-black text-5xl text-white">
                      {wagerPercentage}%
                    </div>
                    <div className="text-center text-green-400 font-bold">
                      Risking: ${wagerPercentage === 99 ? Math.floor(score * 0.99) : Math.max(1, Math.floor(score * (wagerPercentage / 100)))} <span className="text-gray-500 text-sm">(Min: {minWagerPercentage}%)</span>
                    </div>

                    <input
                      type="range"
                      min={minWagerPercentage}
                      max="99"
                      value={wagerPercentage}
                      onChange={(e) => setWagerPercentage(Number(e.target.value))}
                      disabled={wagerLocked}
                      className="w-full h-4 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                  </>
                ) : (
                  <div className="text-center p-6 border-2 border-orange-600 bg-orange-950/40 rounded-lg animate-pulse">
                    <h3 className="text-4xl font-black text-orange-500 uppercase">ALL IN</h3>
                    <p className="text-white font-bold mt-2 tracking-widest text-xl">WAGERING 200% (${score * 2})</p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  {!isAllIn && (
                    <button
                      onClick={() => handleWager(false)}
                      disabled={wagerLocked}
                      className={`w-full py-4 text-lg font-black uppercase tracking-widest ${wagerLocked ? "bg-gray-800 text-gray-500 hidden" : "bg-cyan-700 hover:bg-cyan-600 text-white shadow-[0_0_15px_rgba(14,116,144,0.5)]"}`}
                    >
                      Lock Custom Wager
                    </button>
                  )}

                  <button
                    onClick={() => handleWager(true)}
                    disabled={wagerLocked}
                    className={`w-full py-5 text-xl font-black uppercase tracking-widest ${wagerLocked && !isAllIn ? "hidden" : wagerLocked && isAllIn ? "bg-gray-800 text-gray-500 cursor-not-allowed" : "bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.8)] border border-red-400"} transition-all transform hover:scale-105 active:scale-95`}
                  >
                    {wagerLocked && isAllIn ? "LOCKED IN: 200%" : "ALL IN 🔥 (200%)"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {gameState === "QUESTION_LIVE" && (
          <div className="w-full flex-1 flex flex-col gap-4">
            {isSpectator || score <= 0 ? (
              <div className="text-center mt-10 flex flex-col items-center">
                <h2 className="text-3xl font-black text-gray-500 uppercase tracking-widest mb-6">Spectating</h2>
                <div className="w-full max-w-sm flex flex-col gap-3">
                  {currentOptions.map((opt: string, idx: number) => (
                    <div key={idx} className="w-full min-h-[60px] p-4 text-lg font-bold border border-gray-700 bg-gray-900/50 text-gray-400 flex items-center justify-center">
                      {opt}
                    </div>
                  ))}
                </div>
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
            {isWinner && isTie ? (
              <h2 className="text-4xl font-black text-yellow-400 uppercase tracking-widest mt-10">Market Tie!</h2>
            ) : isWinner ? (
              <h2 className="text-4xl font-black text-green-400 uppercase tracking-widest mt-10">Victory</h2>
            ) : (
              <h2 className="text-4xl font-black text-red-500 uppercase tracking-widest mt-10">Game Over</h2>
            )}
            <p className="text-gray-400 mt-4 leading-relaxed max-w-xs mx-auto">Check the main screen for the final standings!</p>
          </div>
        )}
      </main>
    </div>
  );
}
