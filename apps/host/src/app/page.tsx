/* eslint-disable */
"use client";
import { useEffect, useState } from "react";
import { socket } from "../lib/socket";
import { QRCodeSVG } from "qrcode.react";

const OPTION_LETTERS = ["A", "B", "C", "D"];

export default function HostDashboard() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [gameState, setGameState] = useState<string>("LOBBY");
  const [players, setPlayers] = useState<any[]>([]);
  const [tickerNews, setTickerNews] = useState<string>(
    "VOLATILITY ENGINE FLOOR OPEN  ·  ADMITTING INVESTORS  ·  WAGER WITH CONVICTION  ·  "
  );
  const [slayerWinnerName, setSlayerWinnerName] = useState<string | null>(null);

  // Phase 5 Automation State
  const [gameMode, setGameMode] = useState<"STANDARD" | "SURVIVOR">("STANDARD");
  const [numQuestions, setNumQuestions] = useState<number>(3);
  const [currentQuestionData, setCurrentQuestionData] = useState<any>(null);
  const [questionProgress, setQuestionProgress] = useState<{
    current: number;
    total: number;
    survivorRound: number;
  }>({ current: 0, total: 0, survivorRound: 0 });
  const [survivorFloorAmount, setSurvivorFloorAmount] = useState<number>(0);

  const [availableCategories, setAvailableCategories] = useState<
    { name: string; count: number }[]
  >([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showSectors, setShowSectors] = useState<boolean>(false);
  const [showRules, setShowRules] = useState<boolean>(false);

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

          socket.emit("requestCategories", (catRes: any) => {
            if (catRes.success && catRes.availableCategories) {
              setAvailableCategories(catRes.availableCategories);
              setSelectedCategories(
                catRes.availableCategories.map((c: any) => c.name)
              );
            }
          });
        }
      });
    };

    if (savedRoomCode && savedHostId) {
      socket.emit(
        "reconnectHost",
        { roomCode: savedRoomCode, hostId: savedHostId },
        (res: any) => {
          if (res.success) {
            console.log("Host reconnected", res);
            setRoomCode(savedRoomCode);
            const rs = res.roomState;
            if (rs) {
              setGameState(rs.state);
              setPlayers(Object.values(rs.players));
              setGameMode(rs.mode);
              if (rs.state === "LOBBY") {
                socket.emit("requestCategories", (catRes: any) => {
                  if (catRes.success && catRes.availableCategories) {
                    setAvailableCategories(catRes.availableCategories);
                    setSelectedCategories(
                      catRes.availableCategories.map((c: any) => c.name)
                    );
                  }
                });
              }
              if (
                rs.state === "CATEGORY_REVEAL" &&
                rs.questionQueue &&
                rs.questionQueue[rs.currentQuestionIndex]
              ) {
                setCurrentQuestionData({
                  category:
                    rs.questionQueue[rs.currentQuestionIndex].category.name,
                  multiplier: rs.currentMultiplier,
                });
              } else if (
                rs.state === "QUESTION_LIVE" &&
                rs.questionQueue &&
                rs.questionQueue[rs.currentQuestionIndex]
              ) {
                setCurrentQuestionData((prev: any) => ({
                  ...prev,
                  text: rs.questionQueue[rs.currentQuestionIndex].text,
                  options: rs.questionQueue[rs.currentQuestionIndex].options,
                  multiplier: rs.currentMultiplier,
                }));
              }
              if (rs.totalQuestions !== undefined) {
                setQuestionProgress({
                  current: rs.currentQuestionIndex + 1,
                  total: rs.totalQuestions,
                  survivorRound: rs.survivorRound || 0,
                });
              }
            }
          } else {
            localStorage.removeItem("volatility_roomCode");
            localStorage.removeItem("volatility_hostId");
            initRoom();
          }
        }
      );
    } else {
      initRoom();
    }

    socket.on("playerJoined", (data) => {
      setPlayers((prev) => [...prev, data.player]);
      setTickerNews(
        `NEW SEAT ADMITTED: ${data.player.name.toUpperCase()} ($${data.player.score})  ·  FLOOR ACTIVE  ·  `
      );
    });

    socket.on("playerKicked", (data) => {
      setPlayers((prev) => prev.filter((p) => p.id !== data.playerId));
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
        setQuestionProgress({
          current: data.currentQuestionIndex + 1,
          total: data.totalQuestions,
          survivorRound: data.survivorRound,
        });
        setSurvivorFloorAmount(data.survivorFloorAmount || 0);
        setCurrentQuestionData({
          category: data.questionData.category,
          multiplier: data.questionData.multiplier,
          text: null,
          options: null,
          correctAnswer: null,
        });
      }
      if (data.newState === "QUESTION_LIVE") {
        setCurrentQuestionData((prev: any) => ({
          ...prev,
          text: data.questionText,
          options: data.options,
        }));
      }
    });

    socket.on("playerWagered", (data) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === data.playerId
            ? {
                ...p,
                hasWagered: true,
                currentWager: data.wager,
                isAllIn: data.isAllIn,
              }
            : p
        )
      );
    });

    socket.on("playerAnswered", (data) => {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === data.playerId ? { ...p, hasAnswered: true } : p
        )
      );
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
      setCurrentQuestionData((prev: any) => ({
        ...prev,
        correctAnswer: data.correctAnswer,
        slayerBonusApplied: data.slayerBonusApplied,
      }));
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
    socket.emit("startGame", {
      roomCode,
      mode: gameMode,
      numQuestions,
      selectedCategories,
    });
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const totalPoolQuestions = availableCategories
    .filter((c) => selectedCategories.includes(c.name))
    .reduce((sum, c) => sum + c.count, 0);

  const stateLabelMap: Record<string, string> = {
    LOBBY: "Floor Open for Admission",
    CATEGORY_REVEAL: "Contract Sector Announced",
    WAGER_PERIOD: "Wager Book Open",
    QUESTION_LIVE: "Contract Live",
    RESULTS: "Market Settlement",
    GAME_OVER: "Closing Bell",
  };

  return (
    <div className="min-h-screen bg-[#F1ECDE] text-[#1A1A18] paper-grain flex flex-col justify-between relative overflow-x-hidden">
      {/* BROADSHEET MASTHEAD */}
      <header className="w-full px-8 pt-6 pb-5 border-b border-[#C8BEA4] bg-[#F1ECDE]/95">
        <div className="max-w-7xl mx-auto flex flex-wrap items-end justify-between gap-6 pb-4 double-rule-b">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#736D5A] mb-1">
              Global Trivia Exchange · Live Floor Edition
            </div>
            <h1 className="font-serif text-4xl md:text-5xl font-semibold tracking-tight leading-none text-[#1A1A18]">
              Volatility <span className="italic font-normal text-[#1B4B5A]">Engine</span>
            </h1>
          </div>

          {gameState !== "LOBBY" && gameState !== "GAME_OVER" && (
            <div className="flex flex-col items-center px-6 py-2 bg-[#E6DCC4] border border-[#C8BEA4]">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#736D5A]">
                {stateLabelMap[gameState] || gameState.replace("_", " ")}
              </span>
              <span className="font-mono text-base font-semibold tracking-[0.14em] text-[#1A1A18] tabular-nums mt-0.5">
                {gameMode === "SURVIVOR"
                  ? `SURVIVOR · ROUND ${String(questionProgress.survivorRound).padStart(2, "0")}`
                  : `CONTRACT ${String(questionProgress.current).padStart(2, "0")} OF ${String(questionProgress.total).padStart(2, "0")}`}
              </span>
            </div>
          )}

          {/* Bearer-Bond Room Code */}
          <div className="flex items-stretch border border-[#1A1A18] bg-[#F7F3E8]">
            <div className="px-3 py-2 bg-[#1A1A18] text-[#F1ECDE] flex flex-col justify-center">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] leading-tight">
                Room
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] leading-tight text-[#C8BEA4]">
                Code
              </span>
            </div>
            <div className="px-5 py-1.5 font-mono text-4xl md:text-5xl font-bold tracking-[0.22em] text-[#1B4B5A] tabular-nums leading-none flex items-center">
              {roomCode || "----"}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN FLOOR */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-8 py-8 flex flex-col justify-center">
        {gameState === "LOBBY" && (
          <div className="w-full flex flex-col gap-8 animate-ticket">
            {/* Two-column Broadsheet Lobby */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* LEFT: Physical Admission Ticket */}
              <section className="lg:col-span-5 bg-[#F7F3E8] border border-[#C8BEA4] p-8 ticket-shadow relative">
                <div className="border border-[#C8BEA4] p-6 flex flex-col items-center text-center">
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#736D5A] border-b border-[#C8BEA4] pb-2 w-full">
                    Investor Admission Ticket
                  </span>

                  <p className="font-serif italic text-2xl text-[#1A1A18] mt-5 mb-2">
                    Scan or visit on your phone
                  </p>
                  <a
                    href="https://adaptive-trivia-game-controller.vercel.app"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm font-semibold text-[#1B4B5A] underline underline-offset-4 decoration-[#C8BEA4] hover:decoration-[#1B4B5A] break-all"
                  >
                    adaptive-trivia-game-controller.vercel.app
                  </a>

                  <div className="my-6 p-4 bg-[#FFFFFF] border border-[#1A1A18]">
                    <QRCodeSVG
                      value="https://adaptive-trivia-game-controller.vercel.app"
                      size={164}
                      level="M"
                      fgColor="#1A1A18"
                      bgColor="#FFFFFF"
                    />
                  </div>

                  <div className="w-full pt-4 border-t border-[#C8BEA4] flex items-center justify-between font-mono text-xs text-[#736D5A] uppercase tracking-[0.16em]">
                    <span>Starting Capital</span>
                    <span className="text-[#1A1A18] font-semibold tabular-nums">$1,000</span>
                  </div>
                </div>
              </section>

              {/* RIGHT: Floor Roster + Exchange Controls */}
              <section className="lg:col-span-7 flex flex-col gap-6">
                <div className="flex items-baseline justify-between border-b border-[#1A1A18] pb-3">
                  <div>
                    <h2 className="font-serif text-3xl font-semibold text-[#1A1A18]">
                      Floor <span className="italic font-normal">Roster</span>
                    </h2>
                  </div>
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-[#736D5A] tabular-nums">
                    {players.length} {players.length === 1 ? "Seat" : "Seats"} Active
                  </span>
                </div>

                {/* Investor Ledger Grid */}
                {players.length === 0 ? (
                  <div className="bg-[#E6DCC4]/60 border border-[#C8BEA4] p-10 text-center">
                    <p className="font-serif italic text-2xl text-[#736D5A]">
                      Awaiting the opening bell...
                    </p>
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#736D5A] mt-3">
                      Enter code <span className="text-[#1B4B5A] font-semibold">{roomCode || "----"}</span> on your controller to take a seat
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {players.map((p, i) => (
                      <div
                        key={p.id || i}
                        className="relative bg-[#F7F3E8] border border-[#C8BEA4] p-4 flex flex-col justify-between group hover:border-[#1B4B5A] transition-colors ticket-shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#736D5A] tabular-nums">
                            SEAT {String(i + 1).padStart(2, "0")}
                          </span>
                          <button
                            onClick={() =>
                              socket.emit("kickPlayer", {
                                roomCode,
                                playerId: p.id,
                              })
                            }
                            className="font-mono text-xs text-[#736D5A] hover:text-[#A04A2A] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity px-1 cursor-pointer"
                            title="Remove Investor"
                            aria-label={`Remove ${p.name}`}
                          >
                            ✕
                          </button>
                        </div>
                        <p className="font-serif text-xl font-semibold text-[#1A1A18] truncate">
                          {p.name}
                        </p>
                        <p className="font-mono text-sm font-semibold text-[#1B4B5A] tabular-nums mt-1">
                          ${p.score.toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Exchange Controls (once at least 1 player joins) */}
                {players.length > 0 && (
                  <div className="bg-[#E6DCC4] border border-[#C8BEA4] p-6 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#C8BEA4] pb-4">
                      {/* Mode Switcher */}
                      <div className="flex border border-[#1A1A18] bg-[#F1ECDE]">
                        <button
                          onClick={() => setGameMode("STANDARD")}
                          className={`px-5 py-2.5 font-mono text-xs uppercase tracking-[0.16em] font-semibold transition-colors cursor-pointer ${
                            gameMode === "STANDARD"
                              ? "bg-[#1B4B5A] text-[#F1ECDE]"
                              : "text-[#1A1A18] hover:bg-[#E6DCC4]"
                          }`}
                        >
                          Standard Market
                        </button>
                        <button
                          onClick={() => setGameMode("SURVIVOR")}
                          className={`px-5 py-2.5 font-mono text-xs uppercase tracking-[0.16em] font-semibold transition-colors cursor-pointer border-l border-[#1A1A18] ${
                            gameMode === "SURVIVOR"
                              ? "bg-[#A04A2A] text-[#F1ECDE]"
                              : "text-[#1A1A18] hover:bg-[#E6DCC4]"
                          }`}
                        >
                          Survivor Squeeze
                        </button>
                      </div>

                      {gameMode === "STANDARD" && (
                        <div className="flex items-center gap-3">
                          <label
                            htmlFor="numQuestions"
                            className="font-mono text-xs uppercase tracking-[0.16em] text-[#736D5A]"
                          >
                            Contracts
                          </label>
                          <input
                            id="numQuestions"
                            type="number"
                            min="1"
                            max="20"
                            value={numQuestions}
                            onChange={(e) =>
                              setNumQuestions(Number(e.target.value))
                            }
                            className="w-20 py-2 px-3 text-center font-mono text-lg font-bold bg-[#F7F3E8] border border-[#1A1A18] text-[#1A1A18] tabular-nums focus:outline-none focus:border-[#1B4B5A]"
                          />
                        </div>
                      )}
                    </div>

                    {/* Market Sectors Drawer */}
                    {availableCategories.length > 0 && (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <button
                            onClick={() => setShowSectors(!showSectors)}
                            className="font-mono text-xs uppercase tracking-[0.16em] font-semibold text-[#1B4B5A] hover:underline underline-offset-4 cursor-pointer flex items-center gap-2"
                          >
                            <span>{showSectors ? "−" : "+"}</span>
                            <span>
                              {showSectors
                                ? "Hide Market Sectors"
                                : "Configure Market Sectors"}
                            </span>
                            <span className="px-2 py-0.5 bg-[#F7F3E8] border border-[#C8BEA4] text-[#1A1A18] tabular-nums">
                              {selectedCategories.length} / {availableCategories.length}
                            </span>
                          </button>
                          <span className="font-mono text-xs text-[#736D5A] uppercase tracking-[0.14em] tabular-nums">
                            Pool: <strong className="text-[#1A1A18]">{totalPoolQuestions}</strong> Questions
                          </span>
                        </div>

                        {showSectors && (
                          <div className="pt-3 border-t border-[#C8BEA4]">
                            <div className="flex items-center gap-4 mb-3 font-mono text-[11px] uppercase tracking-[0.16em]">
                              <button
                                onClick={() =>
                                  setSelectedCategories(
                                    availableCategories.map((c) => c.name)
                                  )
                                }
                                className="px-3 py-1 border border-[#1A1A18] bg-[#F7F3E8] hover:bg-[#1A1A18] hover:text-[#F1ECDE] transition-colors cursor-pointer"
                              >
                                Select All
                              </button>
                              <button
                                onClick={() => setSelectedCategories([])}
                                className="px-3 py-1 border border-[#C8BEA4] bg-[#F1ECDE] text-[#736D5A] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors cursor-pointer"
                              >
                                Clear All
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                              {availableCategories.map((cat) => {
                                const active = selectedCategories.includes(
                                  cat.name
                                );
                                return (
                                  <button
                                    key={cat.name}
                                    type="button"
                                    onClick={() => toggleCategory(cat.name)}
                                    className={`p-2.5 text-left border transition-colors cursor-pointer flex flex-col justify-between ${
                                      active
                                        ? "bg-[#F7F3E8] border-[#1B4B5A] text-[#1A1A18]"
                                        : "bg-[#F1ECDE]/60 border-[#C8BEA4] text-[#736D5A] hover:border-[#736D5A]"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <span
                                        className="font-serif text-sm font-medium leading-snug truncate"
                                        title={cat.name}
                                      >
                                        {cat.name
                                          .replace("Entertainment: ", "")
                                          .replace("Science: ", "")}
                                      </span>
                                      <span className="font-mono text-xs text-[#1B4B5A]">
                                        {active ? "✓" : ""}
                                      </span>
                                    </div>
                                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#736D5A] mt-1 tabular-nums">
                                      {cat.count} Qs
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <button
                      onClick={startGame}
                      className="w-full py-4 bg-[#1B4B5A] hover:bg-[#143945] active:translate-y-px text-[#F1ECDE] font-mono text-base font-semibold uppercase tracking-[0.24em] transition-all cursor-pointer border border-[#1A1A18]"
                    >
                      Ring Opening Bell · Start Trading
                    </button>
                  </div>
                )}
              </section>
            </div>

            {/* Compact Collapsible Trading Protocol Strip */}
            <section className="border-t border-[#C8BEA4] pt-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowRules(!showRules)}
                  className="font-mono text-xs uppercase tracking-[0.2em] text-[#736D5A] hover:text-[#1A1A18] transition-colors cursor-pointer flex items-center gap-2"
                >
                  <span>{showRules ? "−" : "+"}</span>
                  <span>Exchange Rules &amp; Trading Protocol</span>
                </button>
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#736D5A] hidden sm:inline">
                  Sector Reveal → Wager → Contract Live → Settlement
                </span>
              </div>

              {showRules && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-5 pt-5 border-t border-[#C8BEA4]">
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#1B4B5A] font-semibold mb-1">
                      01 · Sector &amp; Volatility
                    </div>
                    <p className="font-serif text-base text-[#1A1A18] leading-relaxed">
                      Each contract announces a sector and its dynamic Volatility Multiplier. Wager based on your conviction before the book closes.
                    </p>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#A04A2A] font-semibold mb-1">
                      02 · Settlement &amp; Slayer Bonus
                    </div>
                    <p className="font-serif text-base text-[#1A1A18] leading-relaxed">
                      Correct calls multiply your stake; misses forfeit it. Be the <em>only</em> correct investor in a 3+ player floor to double your payout.
                    </p>
                  </div>
                  <div>
                    <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#736D5A] font-semibold mb-1">
                      03 · Survivor Squeeze
                    </div>
                    <p className="font-serif text-base text-[#1A1A18] leading-relaxed">
                      In Survivor Mode, a rising solvency floor eliminates any portfolio that opens a round below the threshold.
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ACTIVE GAMEPLAY STATES */}
        {gameState !== "LOBBY" && (
          <div className="w-full flex flex-col gap-8 animate-ticket">
            {/* CENTRAL PHYSICAL CONTRACT CARD */}
            <section className="w-full bg-[#F7F3E8] border border-[#1A1A18] p-8 md:p-10 ticket-shadow relative">
              {/* Top folio bar */}
              <div className="flex items-center justify-between border-b border-[#C8BEA4] pb-3 mb-8 font-mono text-xs uppercase tracking-[0.2em] text-[#736D5A]">
                <span>{stateLabelMap[gameState] || gameState}</span>
                {currentQuestionData?.category && gameState !== "GAME_OVER" && (
                  <span className="text-[#1A1A18] font-semibold">
                    {currentQuestionData.category}
                    {currentQuestionData.multiplier
                      ? ` · ${currentQuestionData.multiplier}x`
                      : ""}
                  </span>
                )}
              </div>

              {/* CATEGORY_REVEAL */}
              {gameState === "CATEGORY_REVEAL" && currentQuestionData && (
                <div className="py-6 flex flex-col items-center text-center gap-6">
                  <span className="font-mono text-xs uppercase tracking-[0.24em] text-[#736D5A]">
                    Incoming Contract Sector
                  </span>
                  <h2 className="font-serif italic text-5xl md:text-7xl font-semibold text-[#1A1A18] leading-tight max-w-4xl">
                    {currentQuestionData.category}
                  </h2>
                  <div className="mt-2 px-6 py-3 border-2 border-[#A04A2A] bg-[#F1ECDE] animate-stamp">
                    <span className="font-mono text-xs uppercase tracking-[0.22em] text-[#736D5A] block">
                      Volatility Multiplier
                    </span>
                    <span className="font-mono text-4xl md:text-5xl font-bold text-[#A04A2A] tabular-nums">
                      {currentQuestionData.multiplier}x
                    </span>
                  </div>
                </div>
              )}

              {/* WAGER_PERIOD */}
              {gameState === "WAGER_PERIOD" && (
                <div className="py-4 flex flex-col items-center text-center gap-6">
                  {gameMode === "SURVIVOR" && survivorFloorAmount > 0 && (
                    <div className="px-6 py-3 border border-[#A04A2A] bg-[#A04A2A]/10 flex flex-wrap items-center justify-center gap-3">
                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#A04A2A] font-semibold">
                        Survivor Solvency Floor
                      </span>
                      <span className="font-mono text-xl font-bold text-[#A04A2A] tabular-nums">
                        ${survivorFloorAmount.toLocaleString()}
                      </span>
                    </div>
                  )}

                  <h2 className="font-serif italic text-4xl md:text-6xl font-normal text-[#1A1A18]">
                    Investors Securing Positions
                  </h2>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#736D5A]">
                    Submit stakes on your phone before the bell
                  </p>

                  {timeLeft !== null && (
                    <div
                      className={`font-mono text-7xl md:text-8xl font-bold tabular-nums leading-none mt-2 ${
                        timeLeft <= 5 ? "text-[#A04A2A]" : "text-[#1B4B5A]"
                      }`}
                    >
                      00:{timeLeft.toString().padStart(2, "0")}
                    </div>
                  )}
                </div>
              )}

              {/* QUESTION_LIVE */}
              {gameState === "QUESTION_LIVE" && currentQuestionData && (
                <div className="flex flex-col gap-8">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-8">
                    <h2 className="font-serif text-3xl md:text-4xl font-semibold text-[#1A1A18] leading-snug flex-1 text-left">
                      {currentQuestionData.text}
                    </h2>
                    {timeLeft !== null && (
                      <div
                        className={`px-5 py-3 border border-[#1A1A18] bg-[#F1ECDE] font-mono text-4xl md:text-5xl font-bold tabular-nums shrink-0 ${
                          timeLeft <= 5
                            ? "text-[#A04A2A] border-[#A04A2A]"
                            : "text-[#1B4B5A]"
                        }`}
                      >
                        {timeLeft.toString().padStart(2, "0")}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentQuestionData.options?.map(
                      (opt: string, i: number) => (
                        <div
                          key={i}
                          className="flex items-stretch border border-[#C8BEA4] bg-[#F1ECDE]"
                        >
                          <div className="w-12 bg-[#E6DCC4] border-r border-[#C8BEA4] flex items-center justify-center font-mono text-sm font-bold text-[#736D5A] shrink-0">
                            {OPTION_LETTERS[i] || i + 1}
                          </div>
                          <div className="p-4 font-serif text-xl font-medium text-[#1A1A18] text-left flex items-center">
                            {opt}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* RESULTS */}
              {gameState === "RESULTS" && currentQuestionData && (
                <div className="py-6 flex flex-col items-center text-center gap-5">
                  <span className="font-mono text-xs uppercase tracking-[0.24em] text-[#736D5A]">
                    Verified Settlement Outcome
                  </span>
                  <div className="px-10 py-6 border-2 border-[#1B4B5A] bg-[#1B4B5A] text-[#F1ECDE] font-serif text-4xl md:text-5xl font-semibold">
                    {currentQuestionData.correctAnswer}
                  </div>
                  {currentQuestionData.slayerBonusApplied && (
                    <span className="font-mono text-xs uppercase tracking-[0.22em] text-[#A04A2A] font-semibold">
                      Slayer Bonus Triggered · 2x Solo Payout Applied
                    </span>
                  )}
                </div>
              )}

              {/* GAME_OVER */}
              {gameState === "GAME_OVER" &&
                (() => {
                  const sortedPlayers = [...players].sort(
                    (a, b) => b.score - a.score
                  );
                  const hasPositiveScore = sortedPlayers.some(
                    (p) => p.score > 0
                  );
                  const candidates = hasPositiveScore
                    ? sortedPlayers.filter((p) => p.score > 0)
                    : sortedPlayers;
                  const topScore = candidates[0]?.score ?? 0;
                  const topPlayers = candidates.filter(
                    (p) => p.score === topScore
                  );
                  const isTie = topPlayers.length > 1 && topPlayers.length > 0;

                  return (
                    <div className="py-6 flex flex-col items-center text-center gap-6">
                      <span className="font-mono text-xs uppercase tracking-[0.26em] text-[#A04A2A] font-semibold">
                        Trading Halted · Final Settlement
                      </span>
                      <h2 className="font-serif italic text-5xl md:text-6xl font-semibold text-[#1A1A18]">
                        {isTie ? "Market Tie" : "Top Investor"}
                      </h2>
                      <div className="font-serif text-4xl md:text-5xl font-bold text-[#1B4B5A] border-y-2 border-[#1B4B5A] py-4 px-10">
                        {topPlayers.length > 0
                          ? topPlayers.map((p) => p.name).join(" & ")
                          : "None"}
                      </div>
                      <button
                        onClick={() =>
                          socket.emit("returnToLobby", { roomCode })
                        }
                        className="mt-4 px-10 py-4 bg-[#1A1A18] hover:bg-[#1B4B5A] text-[#F1ECDE] font-mono text-sm uppercase tracking-[0.22em] font-semibold transition-colors cursor-pointer"
                      >
                        Return to Exchange Lobby
                      </button>
                    </div>
                  );
                })()}
            </section>

            {/* INVESTOR PORTFOLIO LEDGER */}
            <section className="w-full">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#736D5A]">
                  Live Investor Ledger
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#736D5A] tabular-nums">
                  {players.length} Accounts
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {players.map((p, i) => {
                  const isBankrupt = p.score <= 0;
                  const wonRound =
                    gameState === "RESULTS" && p.isCorrect === true;
                  const lostRound =
                    gameState === "RESULTS" && p.isCorrect === false;
                  const payoutDelta = Math.floor(
                    p.currentWager *
                      (currentQuestionData?.multiplier || 2) *
                      (currentQuestionData?.slayerBonusApplied ? 2 : 1)
                  );

                  return (
                    <div
                      key={p.id || i}
                      className={`p-5 border flex flex-col justify-between transition-all duration-300 ${
                        isBankrupt
                          ? "bg-[#E6DCC4]/50 border-[#C8BEA4] opacity-55"
                          : wonRound
                          ? "bg-[#F7F3E8] border-2 border-[#1B4B5A] ticket-shadow-sm"
                          : lostRound
                          ? "bg-[#F7F3E8] border-2 border-[#A04A2A]"
                          : "bg-[#F7F3E8] border-[#C8BEA4]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <p className="font-serif text-xl font-semibold text-[#1A1A18] truncate">
                          {p.name}
                        </p>
                        {p.isAllIn &&
                          gameState !== "LOBBY" &&
                          gameState !== "CATEGORY_REVEAL" && (
                            <span className="px-2 py-0.5 border border-[#A04A2A] bg-[#A04A2A] text-[#F1ECDE] font-mono text-[10px] font-bold uppercase tracking-[0.14em] shrink-0">
                              All In
                            </span>
                          )}
                      </div>

                      <div className="flex items-baseline justify-between gap-2">
                        <span
                          className={`font-mono text-2xl font-bold tabular-nums ${
                            isBankrupt ? "text-[#A04A2A]" : "text-[#1A1A18]"
                          }`}
                        >
                          ${p.score.toLocaleString()}
                        </span>

                        {/* Status / Delta stamps */}
                        <div className="text-right font-mono text-xs font-semibold uppercase tracking-[0.12em]">
                          {isBankrupt ? (
                            <span className="text-[#A04A2A]">Insolvent</span>
                          ) : gameState === "WAGER_PERIOD" ? (
                            p.hasWagered ? (
                              <span className="text-[#1B4B5A] tabular-nums">
                                Locked ${p.currentWager}
                              </span>
                            ) : (
                              <span className="text-[#736D5A]">Deciding</span>
                            )
                          ) : gameState === "QUESTION_LIVE" ? (
                            <div className="flex flex-col items-end">
                              <span
                                className={
                                  p.hasAnswered
                                    ? "text-[#1B4B5A]"
                                    : "text-[#736D5A]"
                                }
                              >
                                {p.hasAnswered ? "Filed" : "Pending"}
                              </span>
                              {p.currentWager > 0 && (
                                <span className="text-[11px] text-[#736D5A] tabular-nums">
                                  ${p.currentWager}
                                </span>
                              )}
                            </div>
                          ) : wonRound ? (
                            <span className="text-[#1B4B5A] text-sm font-bold tabular-nums">
                              +${payoutDelta.toLocaleString()}
                            </span>
                          ) : lostRound ? (
                            <span className="text-[#A04A2A] text-sm font-bold tabular-nums">
                              -${p.currentWager.toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* SLAYER BONUS POSTER STAMP OVERLAY */}
      {gameState === "RESULTS" && slayerWinnerName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none bg-[#1A1A18]/75 animate-slayer">
          <div className="bg-[#F1ECDE] border-4 border-[#A04A2A] px-16 py-12 text-center ticket-shadow animate-stamp">
            <span className="font-mono text-xs uppercase tracking-[0.3em] text-[#736D5A] block mb-3">
              Solo Settlement Bonus · 2x Payout
            </span>
            <h2 className="font-serif italic text-8xl md:text-9xl font-bold text-[#A04A2A] leading-none">
              Slayer
            </h2>
            <p className="font-mono text-2xl md:text-3xl font-bold text-[#1A1A18] uppercase tracking-[0.2em] mt-5 pt-4 border-t border-[#C8BEA4]">
              {slayerWinnerName} Takes the Floor
            </p>
          </div>
        </div>
      )}

      {/* MARKET TICKER TAPE */}
      <div className="w-full bg-[#1A1A18] text-[#F1ECDE] border-t border-[#1A1A18] py-2.5 overflow-hidden whitespace-nowrap">
        <div className="inline-block animate-ticker font-mono text-xs uppercase tracking-[0.22em]">
          {tickerNews} {tickerNews} {tickerNews} {tickerNews}
        </div>
      </div>

      {/* COLOPHON FOOTER */}
      <footer className="w-full px-8 py-3 bg-[#E6DCC4] border-t border-[#C8BEA4] flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-[0.16em] text-[#736D5A]">
        <p>
          Contracts seeded via{" "}
          <a
            href="https://opentdb.com"
            target="_blank"
            rel="noreferrer"
            className="text-[#1A1A18] underline underline-offset-4 decoration-[#C8BEA4] hover:decoration-[#1A1A18]"
          >
            OpenTriviaDB
          </a>
        </p>
        <p>
          Maintained by{" "}
          <a
            href="https://github.com/ashketh21"
            target="_blank"
            rel="noreferrer"
            className="text-[#1A1A18] underline underline-offset-4 decoration-[#C8BEA4] hover:decoration-[#1A1A18]"
          >
            ashketh21
          </a>
        </p>
      </footer>
    </div>
  );
}
