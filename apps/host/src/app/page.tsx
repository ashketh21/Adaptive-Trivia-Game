/* eslint-disable */
"use client";
import { useEffect, useState } from "react";
import { socket } from "../lib/socket";
import { QRCodeSVG } from "qrcode.react";

export default function HostDashboard() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [gameState, setGameState] = useState<string>("LOBBY");
  const [players, setPlayers] = useState<any[]>([]);
  const [tickerNews, setTickerNews] = useState<string>("VOLATILITY ENGINE ONLINE // WAITING FOR PLAYERS TO JOIN //");
  const [slayerWinnerName, setSlayerWinnerName] = useState<string | null>(null);

  // Phase 5 Automation State
  const [gameMode, setGameMode] = useState<"STANDARD" | "SURVIVOR">("STANDARD");
  const [numQuestions, setNumQuestions] = useState<number>(3);
  const [currentQuestionData, setCurrentQuestionData] = useState<any>(null);
  const [questionProgress, setQuestionProgress] = useState<{ current: number, total: number, survivorRound: number }>({ current: 0, total: 0, survivorRound: 0 });
  const [survivorFloorAmount, setSurvivorFloorAmount] = useState<number>(0);

  const [availableCategories, setAvailableCategories] = useState<{ name: string, count: number }[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showSectors, setShowSectors] = useState<boolean>(false);

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
    const savedHostId = localStorage.getItem("volatility_hostId");

    const initRoom = () => {
      const code = Math.random().toString(36).substring(2, 6).toUpperCase();
      setRoomCode(code);

      socket.emit("createRoom", { roomCode: code }, (res: any) => {
        console.log("Room created", res);
        if (res.success && res.hostId) {
          localStorage.setItem("volatility_roomCode", res.roomCode);
          localStorage.setItem("volatility_hostId", res.hostId);

          // Fetch Categories
          socket.emit("requestCategories", (catRes: any) => {
            if (catRes.success && catRes.availableCategories) {
              setAvailableCategories(catRes.availableCategories);
              setSelectedCategories(catRes.availableCategories.map((c: any) => c.name)); // Select all by default
            }
          });
        }
      });
    };

    if (savedRoomCode && savedHostId) {
      socket.emit("reconnectHost", { roomCode: savedRoomCode, hostId: savedHostId }, (res: any) => {
        if (res.success) {
          console.log("Host reconnected", res);
          setRoomCode(savedRoomCode);
          const rs = res.roomState;
          if (rs) {
            setGameState(rs.state);
            setPlayers(Object.values(rs.players));
            setGameMode(rs.mode);
            if (rs.state === "LOBBY") {
              // Fetch Categories on reconnect if in LOBBY state
              socket.emit("requestCategories", (catRes: any) => {
                if (catRes.success && catRes.availableCategories) {
                  setAvailableCategories(catRes.availableCategories);
                  setSelectedCategories(catRes.availableCategories.map((c: any) => c.name));
                }
              });
            }
            if (rs.state === "CATEGORY_REVEAL" && rs.questionQueue && rs.questionQueue[rs.currentQuestionIndex]) {
              setCurrentQuestionData({ category: rs.questionQueue[rs.currentQuestionIndex].category.name, multiplier: rs.currentMultiplier });
            } else if (rs.state === 'QUESTION_LIVE' && rs.questionQueue && rs.questionQueue[rs.currentQuestionIndex]) {
              setCurrentQuestionData((prev: any) => ({ ...prev, text: rs.questionQueue[rs.currentQuestionIndex].text, options: rs.questionQueue[rs.currentQuestionIndex].options, multiplier: rs.currentMultiplier }));
            }
            if (rs.totalQuestions !== undefined) {
              setQuestionProgress({ current: rs.currentQuestionIndex + 1, total: rs.totalQuestions, survivorRound: rs.survivorRound || 0 });
            }
          }
        } else {
          localStorage.removeItem("volatility_roomCode");
          localStorage.removeItem("volatility_hostId");
          initRoom();
        }
      });
    } else {
      initRoom();
    }

    socket.on("playerJoined", (data) => {
      setPlayers((prev) => [...prev, data.player]);
      setTickerNews(`NEW INVESTOR JOINED: ${data.player.name.toUpperCase()} // `);
    });

    socket.on("playerKicked", (data) => {
      setPlayers((prev) => prev.filter(p => p.id !== data.playerId));
    });

    socket.on("stateChanged", (data) => {
      setGameState(data.newState);
      if (data.endTime) {
        setEndTime(data.endTime);
      } else {
        setEndTime(null);
        setTimeLeft(null);
      }

      if (data.newState !== "RESULTS") {
        setSlayerWinnerName(null);
      }
      if (data.players) {
        setPlayers(Object.values(data.players));
      }
      if (data.newState === "CATEGORY_REVEAL") {
        setQuestionProgress({ current: data.currentQuestionIndex + 1, total: data.totalQuestions, survivorRound: data.survivorRound });
        setSurvivorFloorAmount(data.survivorFloorAmount || 0);
        setCurrentQuestionData({ category: data.questionData.category, multiplier: data.questionData.multiplier, text: null, options: null, correctAnswer: null });
      }
      if (data.newState === "QUESTION_LIVE") {
        setCurrentQuestionData((prev: any) => ({ ...prev, text: data.questionText, options: data.options }));
      }
    });

    socket.on("playerWagered", (data) => {
      setPlayers((prev) => prev.map(p => p.id === data.playerId ? { ...p, hasWagered: true, currentWager: data.wager, isAllIn: data.isAllIn } : p));
    });

    socket.on("playerAnswered", (data) => {
      setPlayers((prev) => prev.map(p => p.id === data.playerId ? { ...p, hasAnswered: true } : p));
    });

    socket.on("resultsCalculated", (data) => {
      setGameState("RESULTS");
      if (data.slayerBonusApplied && data.slayerBonusWinner) {
        const winner = data.players[data.slayerBonusWinner];
        if (winner) {
          setSlayerWinnerName(winner.name);
        }
      } else {
        setSlayerWinnerName(null);
      }
      setPlayers(Object.values(data.players));
      setCurrentQuestionData((prev: any) => ({ ...prev, correctAnswer: data.correctAnswer, slayerBonusApplied: data.slayerBonusApplied }));
    });

    return () => {
      socket.off("playerJoined");
      socket.off("playerKicked");
      socket.off("stateChanged");
      socket.off("playerWagered");
      socket.off("playerAnswered");
      socket.off("resultsCalculated");
    };
  }, []);

  const startGame = () => {
    socket.emit("startGame", { roomCode, mode: gameMode, numQuestions, selectedCategories });
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col items-center justify-between overflow-hidden">
      {/* HEADER */}
      <header className="w-full flex justify-between items-center p-6 border-b-2 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]">
        <div>
          <h1 className="text-4xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400 uppercase">
            Volatility Engine
          </h1>
          <p className="text-gray-400 text-sm mt-1 tracking-widest">GLOBAL TRIVIA EXCHANGE</p>
        </div>
        {gameState !== "LOBBY" && gameState !== "GAME_OVER" && (
          <div className="text-center font-bold text-gray-300 text-xl tracking-widest">
            {gameMode === "SURVIVOR"
              ? `SURVIVOR // ROUND ${questionProgress.survivorRound}`
              : `QUESTION ${questionProgress.current} OF ${questionProgress.total}`}
          </div>
        )}
        <div className="flex flex-col items-end">
          <p className="text-gray-400 text-sm uppercase">Join Code</p>
          <div className="text-6xl font-black text-green-400 tracking-widest" style={{ textShadow: "0 0 20px #4ade8055" }}>
            {roomCode || "----"}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 w-full max-w-6xl mx-auto p-8 flex flex-col justify-center items-center">
        {gameState === "LOBBY" && (
          <div className="text-center w-full">
            <h2 className="text-2xl text-cyan-400 uppercase tracking-widest mb-12 animate-pulse">
              Awaiting Investors...
            </h2>

            <div className="w-full max-w-2xl mx-auto mb-12 p-8 bg-gray-900 border-2 border-green-800 rounded-xl flex flex-col items-center gap-4">
              <h3 className="text-xl text-white uppercase font-bold tracking-widest">Join at</h3>
              <a href="https://adaptive-trivia-game-controller.vercel.app" target="_blank" rel="noreferrer" className="text-3xl text-cyan-400 font-black tracking-wider hover:underline">
                adaptive-trivia-game-controller.vercel.app
              </a>
              <div className="p-4 bg-white rounded-lg mt-4">
                <QRCodeSVG value="https://adaptive-trivia-game-controller.vercel.app" size={150} level="M" />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full mb-12">
              {players.length === 0 ? (
                <div className="col-span-full text-gray-600 italic">No connections detected. Scan QR or visit URL.</div>
              ) : (
                players.map((p, i) => (
                  <div key={i} className="relative border-2 border-gray-800 bg-gray-900/50 p-6 rounded-lg text-center shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex flex-col justify-center transform transition-transform hover:scale-105 hover:border-cyan-500 group">
                    <button
                      onClick={() => socket.emit("kickPlayer", { roomCode, playerId: p.id })}
                      className="absolute top-2 right-2 text-red-500 hover:text-red-400 font-black text-xl opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Kick Investor"
                    >
                      ✕
                    </button>
                    <p className="font-bold text-xl text-white mb-2">{p.name}</p>
                    <p className="text-green-500 font-mono tracking-widest">${p.score}</p>
                  </div>
                ))
              )}
            </div>

            {players.length > 0 && (
              <div className="flex flex-col items-center gap-6 mt-8 p-6 bg-gray-900 border-2 border-cyan-800 rounded-lg">
                <div className="flex gap-4 w-full justify-center">
                  <button
                    onClick={() => setGameMode("STANDARD")}
                    className={`px-6 py-3 rounded border-2 font-bold uppercase transition-colors ${gameMode === "STANDARD"
                      ? "bg-cyan-900 border-cyan-400 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-400 hover:border-cyan-500 hover:text-cyan-200"
                      }`}
                  >
                    Standard Mode
                  </button>
                  <button
                    onClick={() => setGameMode("SURVIVOR")}
                    className={`px-6 py-3 rounded border-2 font-bold uppercase transition-colors ${gameMode === "SURVIVOR"
                      ? "bg-red-900 border-red-500 text-white"
                      : "bg-gray-800 border-gray-600 text-gray-400 hover:border-red-500 hover:text-red-200"
                      }`}
                  >
                    Survivor Mode
                  </button>
                </div>
                {gameMode === "STANDARD" && (
                  <div className="flex gap-4 items-center">
                    <span className="text-gray-400 font-bold uppercase">Questions:</span>
                    <input type="number" min="1" max="20" value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} className="w-20 p-2 text-center text-xl font-black bg-black border-2 border-cyan-500 text-cyan-400" />
                  </div>
                )}

                {availableCategories.length > 0 && (
                  <div className="w-full mt-6 flex flex-col items-center">
                    <button
                      onClick={() => setShowSectors(!showSectors)}
                      className="text-cyan-400 uppercase tracking-widest font-bold mb-2 border border-cyan-800 px-4 py-2 rounded hover:bg-cyan-900/30 transition-colors flex items-center gap-2"
                    >
                      {showSectors ? '▼ Hide Market Sectors' : '▶ Configure Market Sectors'}
                      <span className="bg-cyan-900 text-white px-2 py-0.5 rounded text-xs ml-2">
                        {selectedCategories.length} / {availableCategories.length} Active
                      </span>
                    </button>

                    <div className="text-gray-400 text-sm font-bold tracking-widest mb-4">
                      Total Questions in Pool: <span className="text-green-400">{availableCategories.filter(c => selectedCategories.includes(c.name)).reduce((sum, c) => sum + c.count, 0)}</span>
                    </div>

                    {showSectors && (
                      <>
                        <div className="flex justify-center gap-6 w-full mb-4 px-4 text-xs font-bold text-gray-400 uppercase tracking-widest border-t border-cyan-800/50 pt-4">
                          <button onClick={() => setSelectedCategories(availableCategories.map(c => c.name))} className="hover:text-white transition-colors border border-gray-600 px-3 py-1 rounded">Select All</button>
                          <button onClick={() => setSelectedCategories([])} className="hover:text-white transition-colors border border-gray-600 px-3 py-1 rounded">Deselect All</button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 w-full max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                          {availableCategories.map(cat => (
                            <div
                              key={cat.name}
                              onClick={() => toggleCategory(cat.name)}
                              className={`p-3 text-sm font-bold border rounded cursor-pointer transition-colors flex flex-col justify-center ${selectedCategories.includes(cat.name) ? 'bg-cyan-900/50 border-cyan-500 text-cyan-50' : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="truncate pr-2" title={cat.name}>{cat.name.replace('Entertainment: ', '').replace('Science: ', '')}</span>
                                {selectedCategories.includes(cat.name) && <span className="text-cyan-400">✓</span>}
                              </div>
                              <span className="text-xs opacity-60 mt-1">{cat.count} Questions</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={startGame}
                  className="px-12 py-4 mt-4 bg-green-500 text-black font-black text-2xl uppercase tracking-widest rounded-sm hover:bg-green-400 transition-colors shadow-[0_0_20px_rgba(34,197,94,0.4)]"
                >
                  Initialize Trading
                </button>
              </div>
            )}

            {/* Gameplay Rules */}
            <div className="mt-12 text-left max-w-4xl mx-auto p-6 bg-gray-900/50 border border-gray-800 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              <h3 className="text-xl font-bold text-cyan-500 uppercase tracking-widest mb-4 border-b border-gray-700 pb-2">
                Trading Protocol
              </h3>
              <ol className="list-decimal list-inside text-gray-400 space-y-3 font-medium text-lg">
                <li><span className="text-cyan-300 font-bold uppercase tracking-wider">Sector Reveal:</span> A new category and its Volatility Multiplier are announced.</li>
                <li><span className="text-yellow-400 font-bold uppercase tracking-wider">Wager Period:</span> Investors risk capital based on confidence. (Minimums strictly enforced by the algorithm).</li>
                <li><span className="text-white font-bold uppercase tracking-wider">Question Live:</span> Answer the contract before time expires.</li>
                <li><span className="text-green-400 font-bold uppercase tracking-wider">Balance Updated:</span> Correct answers multiply your wager. <span className="text-red-400 font-bold">Incorrect ones lose it!</span></li>
                <li><span className="text-red-500 font-bold uppercase tracking-wider">Slayer Bonus:</span> Being the ONLY correct investor in a &gt;2 player market automatically doubles your payout!</li>
                <li><span className="text-orange-500 font-bold uppercase tracking-wider">Survivor Squeeze (Survivor Mode Only):</span> A rising tide floor mathematically eliminates players whose total balance drops beneath it at the start of a round.</li>
              </ol>
            </div>
          </div>
        )}

        {/* Live Game Content */}
        {gameState !== "LOBBY" && (
          <div className="text-center flex flex-col items-center gap-6 w-full">
            <h2 className={`text-5xl font-black uppercase mb-2 animate-pulse ${gameState === 'GAME_OVER' ? 'text-yellow-400' : 'text-cyan-400'}`}>{gameState.replace('_', ' ')}</h2>

            {/* Dynamic Content Area based on State */}
            <div className={`min-h-[200px] w-full max-w-4xl p-8 border-2 border-dashed flex flex-col items-center justify-center bg-gray-900/40 transition-colors ${gameState === 'GAME_OVER' ? 'border-yellow-500' : 'border-gray-600'}`}>
              {gameState === "CATEGORY_REVEAL" && currentQuestionData && (
                <>
                  <h3 className="text-gray-400 font-bold uppercase tracking-widest mb-4">Incoming Contract Sector:</h3>
                  <div className="text-6xl font-black text-white uppercase text-center mb-6">{currentQuestionData.category}</div>
                  <div className="text-3xl text-red-500 font-black">Volatility Multiplier: {currentQuestionData.multiplier}x</div>
                </>
              )}
              {gameState === "WAGER_PERIOD" && (
                <div className="flex flex-col items-center gap-4 min-w-full">
                  {currentQuestionData && (
                    <div className="bg-gray-800/80 px-6 py-2 rounded-full border border-gray-600 mb-4 flex gap-4 text-sm font-bold tracking-widest items-center">
                      <span className="text-gray-300 uppercase">{currentQuestionData.category}</span>
                      <span className="text-gray-600">|</span>
                      <span className="text-red-400 uppercase">{currentQuestionData.multiplier}x Multiplier</span>
                    </div>
                  )}
                  {gameMode === "SURVIVOR" && (
                    <div className="bg-red-950/40 border border-red-500/50 px-6 py-2 rounded mb-2 flex flex-col items-center">
                      <span className="text-red-400 text-sm font-black uppercase tracking-widest">Survivor Minimum Trade required to avoid bankruptcy</span>
                      <span className="text-white text-2xl font-black">${survivorFloorAmount}</span>
                    </div>
                  )}
                  <h3 className="text-4xl font-bold text-yellow-400 uppercase tracking-widest">
                    Investors Securing Positions...
                  </h3>
                  {timeLeft !== null && (
                    <div className={`text-6xl font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-200'}`}>
                      {timeLeft.toString().padStart(2, '0')}
                    </div>
                  )}
                </div>
              )}
              {gameState === "QUESTION_LIVE" && currentQuestionData && (
                <>
                  <div className="flex justify-between items-start w-full gap-8 mb-8 border-l-4 border-cyan-500 pl-6">
                    <h3 className="text-3xl font-black text-white text-left leading-tight flex-1">{currentQuestionData.text}</h3>
                    {timeLeft !== null && (
                      <div className={`text-5xl font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-cyan-400'}`}>
                        {timeLeft.toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 w-full">
                    {currentQuestionData.options?.map((opt: string, i: number) => (
                      <div key={i} className="p-4 bg-gray-800 border border-gray-600 text-xl font-bold text-gray-200">{opt}</div>
                    ))}
                  </div>
                </>
              )}
              {gameState === "RESULTS" && currentQuestionData && (
                <>
                  <h3 className="text-gray-400 font-bold uppercase tracking-widest mb-4">Correct Outcome:</h3>
                  <div className="text-5xl font-black text-green-400 bg-green-900/30 p-6 border-2 border-green-500 uppercase rounded-lg shadow-[0_0_20px_rgba(34,197,94,0.3)]">{currentQuestionData.correctAnswer}</div>
                </>
              )}
              {gameState === "GAME_OVER" && (() => {
                const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
                const hasPositiveScore = sortedPlayers.some(p => p.score > 0);
                const candidates = hasPositiveScore ? sortedPlayers.filter(p => p.score > 0) : sortedPlayers;
                const topScore = candidates[0]?.score ?? 0;
                const topPlayers = candidates.filter(p => p.score === topScore);
                const isTie = topPlayers.length > 1 && topPlayers.length > 0;

                return (
                  <div className="flex flex-col items-center gap-6">
                    <h3 className="text-5xl font-black text-yellow-400 uppercase tracking-widest mb-4">Trading Halted</h3>
                    <div className="text-4xl font-bold text-white">
                      {isTie ? 'MARKET TIE: ' : 'Top Investor: '}
                      <span className="text-green-400">
                        {topPlayers.length > 0 ? topPlayers.map(p => p.name).join(' & ') : 'None'}
                      </span>
                    </div>
                    <button
                      onClick={() => socket.emit("returnToLobby", { roomCode })}
                      className="px-12 py-4 mt-8 bg-cyan-600 text-black font-black text-xl uppercase tracking-widest rounded-sm hover:bg-cyan-500 pointer-events-auto"
                    >
                      Return to Lobby
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Show Player Scores updated dynamically */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full mt-6 pointer-events-none">
              {players.map((p, i) => (
                <div key={i} className={`border-2 p-6 rounded-lg text-center shadow-[0_4px_20px_rgba(0,0,0,0.5)] flex flex-col relative transition-all duration-500 ${p.score <= 0 ? 'border-red-900 bg-red-950/30 opacity-50' :
                  gameState === "RESULTS" && p.isCorrect === true ? 'border-green-500 bg-green-900/40 scale-105 animate-[pulse_2s_infinite]' :
                    gameState === "RESULTS" && p.isCorrect === false ? 'border-red-500 bg-red-900/40 opacity-75' :
                      gameState === "GAME_OVER" && p.score > 0 ? 'border-yellow-500 bg-yellow-900/40 scale-105' :
                        'border-gray-800 bg-gray-900/50'
                  }`}>
                  <p className="font-bold text-xl text-white mb-2">{p.name}</p>
                  <p className="text-green-500 font-mono tracking-widest text-2xl">${p.score}</p>

                  {/* Status Badges */}
                  <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                    {p.isAllIn && gameState !== "LOBBY" && gameState !== "CATEGORY_REVEAL" && (
                      <span className="bg-orange-600 text-white px-2 py-1 font-black text-xs shadow-[0_0_10px_rgba(234,88,12,0.8)] animate-pulse uppercase">🔥 All In</span>
                    )}
                    {/* Wager Period status */}
                    {gameState === "WAGER_PERIOD" && (
                      p.hasWagered
                        ? <span className="bg-yellow-500 text-black px-2 py-1 font-bold text-xs shadow-md">Locked: ${p.currentWager}</span>
                        : <span className="bg-gray-700 text-gray-300 px-2 py-1 font-bold text-xs animate-pulse opacity-50">Deciding...</span>
                    )}

                    {/* Question Live status */}
                    {gameState === "QUESTION_LIVE" && (
                      <>
                        {p.hasAnswered
                          ? <span className="bg-cyan-500 text-black px-2 py-1 font-bold text-xs shadow-md">Answered</span>
                          : <span className="bg-gray-700 text-gray-300 px-2 py-1 font-bold text-xs animate-pulse opacity-50">Thinking...</span>}
                        {p.currentWager > 0 && <span className="text-yellow-500 font-black text-xs font-mono mt-1">${p.currentWager}</span>}
                      </>
                    )}

                    {/* Results status */}
                    {gameState === "RESULTS" && p.isCorrect && <span className="text-green-400 font-black">+${Math.floor(p.currentWager * (currentQuestionData?.multiplier || 2) * (currentQuestionData?.slayerBonusApplied ? 2 : 1))}</span>}
                    {gameState === "RESULTS" && p.isCorrect === false && <span className="text-red-500 font-black">-${p.currentWager}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* SLAYER BONUS OVERLAY - Adjusted to briefly flash */}
      {gameState === "RESULTS" && slayerWinnerName && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none animate-[fadeout_3s_forwards]">
          <div className="text-center animate-[bounce_1s_infinite]">
            <h1 className="text-[10rem] font-black text-red-500 tracking-widest uppercase mb-4" style={{ textShadow: "0 0 60px #ef4444" }}>
              SLAYER
            </h1>
            <p className="text-6xl text-white font-bold tracking-widest uppercase" style={{ textShadow: "0 0 20px #ffffff" }}>
              {slayerWinnerName} TAKES IT ALL
            </p>
          </div>
        </div>
      )}

      {/* NEWS TICKER */}
      <div className="w-full bg-red-900 border-t-2 border-red-500 p-3 overflow-hidden whitespace-nowrap">
        <div className="inline-block animate-[ticker_20s_linear_infinite] text-red-200 font-black tracking-widest text-lg">
          {tickerNews} {tickerNews} {tickerNews} {tickerNews}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="w-full p-4 border-t-2 border-gray-900 bg-black flex flex-col items-center justify-center gap-2 text-xs text-gray-500 font-mono tracking-widest uppercase text-center relative z-10">
        <p>
          Questions seeded from <a href="https://opentdb.com" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-white underline transition-colors">OpenTriviaDB</a>
        </p>
        <p>
          Developed and maintained by <a href="https://github.com/ashketh21" target="_blank" rel="noreferrer" className="text-gray-400 hover:text-white underline transition-colors">ashketh21</a>
        </p>
      </footer>

      {/* Inline styles for animations */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes fadeout {
          0% { opacity: 1; background: rgba(0,0,0,0.8); backdrop-filter: blur(12px); }
          70% { opacity: 1; background: rgba(0,0,0,0.5); backdrop-filter: blur(5px); }
          100% { opacity: 0; background: transparent; backdrop-filter: none; display: none; }
        }
      `}} />
    </div>
  );
}
