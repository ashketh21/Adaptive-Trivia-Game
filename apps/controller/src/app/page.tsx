/* eslint-disable */
"use client";
import { useState, useEffect, useRef } from "react";
import { socket } from "../lib/socket";

const OPTION_LETTERS = ["A", "B", "C", "D"];

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
  const [wagerPercentage, setWagerPercentage] = useState(10);
  const [minWagerPercentage, setMinWagerPercentage] = useState(10);
  const [wagerLocked, setWagerLocked] = useState(false);
  const [isAllIn, setIsAllIn] = useState(false);

  const [answerLocked, setAnswerLocked] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [wonSlayerBonus, setWonSlayerBonus] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [currentOptions, setCurrentOptions] = useState<string[]>([]);
  const [currentCategory, setCurrentCategory] = useState<string | null>(null);
  const [currentMultiplier, setCurrentMultiplier] = useState<number | null>(
    null
  );

  const [questionProgress, setQuestionProgress] = useState<{
    current: number;
    total: number;
    survivorRound: number;
  }>({ current: 0, total: 0, survivorRound: 0 });
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
      socket.emit(
        "reconnectPlayer",
        { roomCode: savedRoomCode, playerId: savedPlayerId },
        (res: any) => {
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
              if (
                rs.questionQueue &&
                rs.questionQueue[rs.currentQuestionIndex]
              ) {
                setCurrentCategory(
                  rs.questionQueue[rs.currentQuestionIndex].category.name
                );
              }
              if (rs.totalQuestions !== undefined) {
                setQuestionProgress({
                  current: rs.currentQuestionIndex + 1,
                  total: rs.totalQuestions,
                  survivorRound: rs.survivorRound || 0,
                });
              }
              const myPlayer = Object.values(rs.players).find(
                (p: any) => p.id === savedPlayerId
              ) as any;
              if (myPlayer) {
                setScore(myPlayer.score);
                setIsCorrect(myPlayer.isCorrect);
                if (rs.state === "WAGER_PERIOD") {
                  setWagerLocked(myPlayer.hasWagered);
                  setIsAllIn(myPlayer.isAllIn);
                  setMinWagerPercentage(rs.currentMinWagerPercentage || 10);
                  setWagerPercentage(
                    myPlayer.hasWagered
                      ? Math.floor((myPlayer.currentWager / myPlayer.score) * 100)
                      : rs.currentMinWagerPercentage || 10
                  );
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
        }
      );
    }

    socket.on("kicked", () => {
      setJoined(false);
      localStorage.removeItem("volatility_roomCode");
      localStorage.removeItem("volatility_playerId");
      localStorage.removeItem("volatility_playerName");
      alert("You have been removed from the trading floor.");
    });

    socket.on("stateChanged", (data) => {
      setGameState(data.newState);
      if (data.endTime) {
        setEndTime(data.endTime);
      } else {
        setEndTime(null);
        setTimeLeft(null);
      }

      if (
        data.newState === "LOBBY" &&
        isSpectatorRef.current &&
        roomCodeRef.current &&
        playerNameRef.current
      ) {
        socket.emit(
          "joinRoom",
          {
            roomCode: roomCodeRef.current,
            playerName: playerNameRef.current,
          },
          (res: any) => {
            if (res.success && !res.spectator) {
              setIsSpectator(false);
              if (res.playerId)
                localStorage.setItem("volatility_playerId", res.playerId);
            }
          }
        );
      }

      if (data.players) {
        const myPlayer = Object.values(data.players).find(
          (p: any) => p.socketId === socket.id
        ) as any;
        if (myPlayer) {
          setScore(myPlayer.score);
          setIsCorrect(myPlayer.isCorrect);
        }
      }

      if (data.newState === "CATEGORY_REVEAL") {
        setIsCorrect(null);
        setIsAllIn(false);
        setSelectedAnswer(null);
        setQuestionProgress({
          current: data.currentQuestionIndex + 1,
          total: data.totalQuestions,
          survivorRound: data.survivorRound,
        });
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
        setSelectedAnswer(null);
        setCurrentOptions(data.options || []);
      }

      if (data.newState === "GAME_OVER" && data.players) {
        setIsCorrect(null);
        const sorted = Object.values(data.players) as any[];
        sorted.sort((a, b) => b.score - a.score);
        const hasPositive = sorted.some((p) => p.score > 0);
        const candidates = hasPositive
          ? sorted.filter((p) => p.score > 0)
          : sorted;
        const topScore = candidates[0]?.score ?? 0;
        const topPlayers = candidates.filter((p) => p.score === topScore);

        setIsTie(topPlayers.length > 1 && topPlayers.length > 0);
        setIsWinner(topPlayers.some((p) => p.socketId === socket.id));
      }
    });

    socket.on("resultsCalculated", (data) => {
      setGameState("RESULTS");
      const myPlayer = Object.values(data.players).find(
        (p: any) => p.socketId === socket.id
      ) as any;
      if (myPlayer) {
        setScore(myPlayer.score);
        setIsCorrect(myPlayer.isCorrect);
      }

      if (
        data.slayerBonusApplied &&
        myPlayer &&
        data.slayerBonusWinner === myPlayer.id
      ) {
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

    socket.emit(
      "joinRoom",
      { roomCode: roomCode.toUpperCase(), playerName },
      (res: any) => {
        if (res.success) {
          setJoined(true);
          if (res.spectator) {
            setIsSpectator(true);
            const rs = res.roomState;
            if (rs) {
              setGameState(rs.state);
              setCurrentMultiplier(rs.currentMultiplier);
              if (
                rs.questionQueue &&
                rs.questionQueue[rs.currentQuestionIndex]
              ) {
                setCurrentCategory(
                  rs.questionQueue[rs.currentQuestionIndex].category.name
                );
              }
              if (rs.totalQuestions !== undefined) {
                setQuestionProgress({
                  current: rs.currentQuestionIndex + 1,
                  total: rs.totalQuestions,
                  survivorRound: rs.survivorRound || 0,
                });
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
      }
    );
  };

  const calculatedWager =
    wagerPercentage === 99
      ? Math.floor(score * 0.99)
      : Math.max(1, Math.floor(score * (wagerPercentage / 100)));

  const projectedWin = Math.floor(
    (isAllIn ? score * 2 : calculatedWager) * (currentMultiplier || 2)
  );

  const handleWager = (allIn: boolean = false) => {
    const wagerAmount = allIn ? score * 2 : calculatedWager;
    socket.emit(
      "submitWager",
      { roomCode: roomCode.toUpperCase(), wager: wagerAmount },
      (res: any) => {
        if (res.success) {
          setWagerLocked(true);
          if (allIn) setIsAllIn(true);
        }
      }
    );
  };

  const submitAnswer = (answerText: string) => {
    setSelectedAnswer(answerText);
    socket.emit(
      "submitAnswer",
      { roomCode: roomCode.toUpperCase(), answer: answerText },
      (res: any) => {
        if (res.success) setAnswerLocked(true);
      }
    );
  };

  const quickPresets = [
    { label: "MIN", value: minWagerPercentage },
    { label: "25%", value: Math.max(minWagerPercentage, 25) },
    { label: "50%", value: Math.max(minWagerPercentage, 50) },
    { label: "75%", value: Math.max(minWagerPercentage, 75) },
    { label: "MAX", value: 99 },
  ];

  /* ADMISSION SLIP (UNJOINED) */
  if (!joined) {
    return (
      <div className="min-h-[100dvh] bg-[#F1ECDE] text-[#1A1A18] paper-grain flex flex-col items-center justify-center p-5">
        <div className="w-full max-w-sm bg-[#F7F3E8] border border-[#1A1A18] p-7 ticket-shadow animate-ticket">
          <div className="pb-4 mb-6 double-rule-b text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#736D5A] block mb-1">
              Global Trivia Exchange
            </span>
            <h1 className="font-serif text-3xl font-semibold text-[#1A1A18]">
              Investor <span className="italic font-normal text-[#1B4B5A]">Admission</span>
            </h1>
          </div>

          <form onSubmit={handleJoin} className="flex flex-col gap-5">
            <div>
              <label
                htmlFor="roomCode"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#736D5A] block mb-2"
              >
                Room Code
              </label>
              <input
                id="roomCode"
                type="text"
                maxLength={4}
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                className="w-full bg-[#F1ECDE] border border-[#1A1A18] text-center font-mono text-4xl font-bold py-3.5 tracking-[0.35em] text-[#1B4B5A] uppercase focus:outline-none focus:border-2 focus:border-[#1B4B5A]"
                placeholder="----"
                required
              />
            </div>

            <div>
              <label
                htmlFor="playerName"
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#736D5A] block mb-2"
              >
                Investor Alias
              </label>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                className="w-full bg-[#F1ECDE] border border-[#1A1A18] text-center font-serif text-2xl font-semibold py-3.5 px-3 text-[#1A1A18] uppercase focus:outline-none focus:border-2 focus:border-[#1B4B5A]"
                placeholder="TRADER 01"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full min-h-[54px] mt-2 bg-[#1B4B5A] hover:bg-[#143945] active:translate-y-px text-[#F1ECDE] font-mono text-sm font-semibold uppercase tracking-[0.22em] transition-all cursor-pointer border border-[#1A1A18]"
            >
              Enter the Floor
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ACTIVE CONTROLLER */
  const resultsBg =
    gameState === "RESULTS" && isCorrect === true
      ? "bg-[#1B4B5A]/15"
      : gameState === "RESULTS" && isCorrect === false
      ? "bg-[#A04A2A]/15"
      : "bg-[#F1ECDE]";

  return (
    <div
      className={`min-h-[100dvh] ${resultsBg} text-[#1A1A18] paper-grain flex flex-col transition-colors duration-500`}
    >
      {/* PERSISTENT PORTFOLIO HEADER */}
      <header className="w-full px-5 py-3.5 bg-[#E6DCC4] border-b border-[#1A1A18] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-serif text-lg font-semibold text-[#1A1A18] truncate leading-tight">
            {playerName}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#736D5A] mt-0.5">
            {isSpectator
              ? "Spectator Seat"
              : gameState !== "LOBBY" &&
                gameState !== "GAME_OVER" &&
                questionProgress.total > 0
              ? questionProgress.survivorRound > 0
                ? `Survivor · Round ${questionProgress.survivorRound}`
                : `Contract ${questionProgress.current} / ${questionProgress.total}`
              : `Room ${roomCode}`}
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#736D5A]">
            Balance
          </div>
          <div
            className={`font-mono text-xl font-bold tabular-nums leading-tight ${
              score <= 0 ? "text-[#A04A2A]" : "text-[#1B4B5A]"
            }`}
          >
            ${score.toLocaleString()}
          </div>
        </div>
      </header>

      {/* MAIN SLIP CONTENT */}
      <main className="flex-1 flex flex-col items-center justify-center p-5">
        {/* LOBBY */}
        {gameState === "LOBBY" && (
          <div className="w-full max-w-sm bg-[#F7F3E8] border border-[#1A1A18] p-8 text-center ticket-shadow animate-ticket">
            {isSpectator && (
              <span className="inline-block mb-4 px-3 py-1 bg-[#E6DCC4] border border-[#C8BEA4] font-mono text-[10px] uppercase tracking-[0.2em] text-[#736D5A]">
                Spectator Mode
              </span>
            )}
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#1B4B5A] font-semibold block">
              Seat Confirmed
            </span>
            <h2 className="font-serif italic text-3xl font-semibold text-[#1A1A18] mt-2">
              Awaiting the Bell
            </h2>
            <p className="font-serif text-base text-[#736D5A] mt-4 leading-relaxed">
              Watch the main exchange screen. Trading opens momentarily.
            </p>
          </div>
        )}

        {/* CATEGORY_REVEAL */}
        {gameState === "CATEGORY_REVEAL" && (
          <div className="w-full max-w-sm bg-[#F7F3E8] border border-[#1A1A18] p-7 text-center ticket-shadow animate-ticket flex flex-col gap-5">
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#736D5A] border-b border-[#C8BEA4] pb-3">
              Incoming Contract Sector
            </span>
            <h2 className="font-serif italic text-3xl font-semibold text-[#1A1A18] leading-snug">
              {currentCategory || "Unknown Sector"}
            </h2>
            {currentMultiplier && (
              <div className="py-3 border-2 border-[#A04A2A] bg-[#F1ECDE]">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#736D5A] block">
                  Volatility Multiplier
                </span>
                <span className="font-mono text-3xl font-bold text-[#A04A2A] tabular-nums">
                  {currentMultiplier}x
                </span>
              </div>
            )}
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#736D5A]">
              Prepare your wager...
            </p>
          </div>
        )}

        {/* WAGER_PERIOD — PHYSICAL ORDER TICKET */}
        {gameState === "WAGER_PERIOD" && (
          <div className="w-full max-w-sm flex flex-col gap-4 animate-ticket">
            {isSpectator ? (
              <div className="bg-[#F7F3E8] border border-[#C8BEA4] p-8 text-center">
                <h2 className="font-serif italic text-3xl text-[#1A1A18]">
                  Spectating Floor
                </h2>
                <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#736D5A] mt-3">
                  Investors are locking positions
                </p>
              </div>
            ) : score <= 0 ? (
              <div className="bg-[#F7F3E8] border-2 border-[#A04A2A] p-8 text-center">
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#A04A2A] font-semibold">
                  Account Liquidated
                </span>
                <h2 className="font-serif italic text-4xl font-semibold text-[#A04A2A] mt-2">
                  Insolvent
                </h2>
                <p className="font-serif text-base text-[#736D5A] mt-3">
                  You have been eliminated from further trading.
                </p>
              </div>
            ) : (
              <div className="bg-[#F7F3E8] border border-[#1A1A18] p-5 ticket-shadow flex flex-col gap-5">
                {/* Order Ticket Header */}
                <div className="flex items-start justify-between gap-3 border-b border-[#C8BEA4] pb-3">
                  <div className="min-w-0">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#736D5A] block">
                      {currentCategory}
                    </span>
                    <span className="font-mono text-sm font-bold text-[#A04A2A] tabular-nums">
                      {currentMultiplier}x MULTIPLIER
                    </span>
                  </div>
                  {timeLeft !== null && (
                    <span
                      className={`font-mono text-2xl font-bold tabular-nums shrink-0 ${
                        timeLeft <= 5 ? "text-[#A04A2A]" : "text-[#1B4B5A]"
                      }`}
                    >
                      00:{timeLeft.toString().padStart(2, "0")}
                    </span>
                  )}
                </div>

                {survivorFloorAmount > 0 && (
                  <div className="px-3 py-2.5 border border-[#A04A2A] bg-[#A04A2A]/10 text-left">
                    <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#A04A2A] font-semibold block">
                      Survivor Solvency Floor
                    </span>
                    <p className="font-serif text-sm text-[#1A1A18] mt-0.5">
                      Stay above{" "}
                      <strong className="font-mono tabular-nums">
                        ${survivorFloorAmount.toLocaleString()}
                      </strong>{" "}
                      to survive next round.
                    </p>
                  </div>
                )}

                {!isAllIn ? (
                  <>
                    {/* Big Percentage + Risk/Reward Ledger */}
                    <div className="text-center">
                      <div className="font-mono text-5xl font-bold text-[#1A1A18] tabular-nums leading-none">
                        {wagerPercentage}%
                      </div>
                      <div className="grid grid-cols-2 border border-[#C8BEA4] bg-[#F1ECDE] mt-4">
                        <div className="p-2.5 border-r border-[#C8BEA4]">
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#736D5A] block">
                            Stake
                          </span>
                          <span className="font-mono text-lg font-bold text-[#1A1A18] tabular-nums">
                            ${calculatedWager.toLocaleString()}
                          </span>
                        </div>
                        <div className="p-2.5">
                          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#736D5A] block">
                            If Correct
                          </span>
                          <span className="font-mono text-lg font-bold text-[#1B4B5A] tabular-nums">
                            +${projectedWin.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick-Stake Presets */}
                    <div className="grid grid-cols-5 gap-1.5">
                      {quickPresets.map((preset) => {
                        const isSelected = wagerPercentage === preset.value;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            disabled={wagerLocked}
                            onClick={() => setWagerPercentage(preset.value)}
                            className={`min-h-[40px] font-mono text-xs font-semibold border transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-[#1A1A18] text-[#F1ECDE] border-[#1A1A18]"
                                : "bg-[#F1ECDE] text-[#1A1A18] border-[#C8BEA4] hover:border-[#1A1A18]"
                            } disabled:opacity-40`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Precision Slider */}
                    <div className="py-2">
                      <input
                        type="range"
                        min={minWagerPercentage}
                        max="99"
                        value={wagerPercentage}
                        onChange={(e) =>
                          setWagerPercentage(Number(e.target.value))
                        }
                        disabled={wagerLocked}
                        className="wager-slider"
                        aria-label="Wager percentage"
                      />
                      <div className="flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[#736D5A] mt-1.5 tabular-nums">
                        <span>Min {minWagerPercentage}%</span>
                        <span>Max 99%</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-5 border-2 border-[#A04A2A] bg-[#A04A2A]/10 text-center">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#A04A2A] font-semibold">
                      Leverage Position Locked
                    </span>
                    <h3 className="font-serif italic text-4xl font-bold text-[#A04A2A] mt-1">
                      All In · 200%
                    </h3>
                    <p className="font-mono text-lg font-bold text-[#1A1A18] tabular-nums mt-2">
                      Stake ${(score * 2).toLocaleString()} · Win +$
                      {projectedWin.toLocaleString()}
                    </p>
                  </div>
                )}

                {/* Execution Buttons */}
                <div className="flex flex-col gap-2.5">
                  {!isAllIn && !wagerLocked && (
                    <button
                      onClick={() => handleWager(false)}
                      className="w-full min-h-[52px] bg-[#1B4B5A] hover:bg-[#143945] active:translate-y-px text-[#F1ECDE] font-mono text-sm font-semibold uppercase tracking-[0.2em] border border-[#1A1A18] transition-all cursor-pointer"
                    >
                      Lock Stake (${calculatedWager.toLocaleString()})
                    </button>
                  )}

                  {wagerLocked && !isAllIn && (
                    <div className="w-full py-3.5 text-center border border-[#1B4B5A] bg-[#1B4B5A]/10 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#1B4B5A]">
                      Position Locked · ${calculatedWager.toLocaleString()}
                    </div>
                  )}

                  {(!wagerLocked || isAllIn) && (
                    <button
                      onClick={() => handleWager(true)}
                      disabled={wagerLocked}
                      className={`w-full min-h-[52px] font-mono text-sm font-bold uppercase tracking-[0.2em] border transition-all ${
                        wagerLocked && isAllIn
                          ? "bg-[#E6DCC4] border-[#C8BEA4] text-[#736D5A] cursor-not-allowed"
                          : "bg-[#A04A2A] hover:bg-[#863C20] active:translate-y-px text-[#F1ECDE] border-[#1A1A18] cursor-pointer"
                      }`}
                    >
                      {wagerLocked && isAllIn
                        ? "Locked In · 200% Leverage"
                        : "All In · 200% Leverage"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* QUESTION_LIVE */}
        {gameState === "QUESTION_LIVE" && (
          <div className="w-full max-w-sm flex-1 flex flex-col justify-center gap-4 animate-ticket">
            {isSpectator || score <= 0 ? (
              <div className="bg-[#F7F3E8] border border-[#C8BEA4] p-6 text-center">
                <h2 className="font-serif italic text-2xl text-[#736D5A] mb-4">
                  Spectating Contract
                </h2>
                <div className="flex flex-col gap-2.5">
                  {currentOptions.map((opt: string, idx: number) => (
                    <div
                      key={idx}
                      className="p-3.5 border border-[#C8BEA4] bg-[#F1ECDE] font-serif text-base text-[#736D5A] text-left"
                    >
                      <span className="font-mono text-xs mr-3">
                        {OPTION_LETTERS[idx] || idx + 1}
                      </span>
                      {opt}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-[#1A1A18] pb-2.5">
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-[#736D5A]">
                    Execute Call
                  </span>
                  {timeLeft !== null && (
                    <span
                      className={`font-mono text-2xl font-bold tabular-nums ${
                        timeLeft <= 5 ? "text-[#A04A2A]" : "text-[#1B4B5A]"
                      }`}
                    >
                      00:{timeLeft.toString().padStart(2, "0")}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-3">
                  {currentOptions.map((opt: string, idx: number) => {
                    const isPicked = selectedAnswer === opt;
                    return (
                      <button
                        key={idx}
                        onClick={() => submitAnswer(opt)}
                        disabled={answerLocked}
                        className={`w-full min-h-[68px] flex items-stretch text-left border transition-all ${
                          answerLocked
                            ? isPicked
                              ? "bg-[#1B4B5A] text-[#F1ECDE] border-[#1A1A18]"
                              : "bg-[#E6DCC4]/60 text-[#736D5A] border-[#C8BEA4] opacity-60"
                            : "bg-[#F7F3E8] text-[#1A1A18] border-[#1A1A18] hover:bg-[#1B4B5A] hover:text-[#F1ECDE] active:translate-y-px cursor-pointer"
                        }`}
                      >
                        <div
                          className={`w-12 flex items-center justify-center font-mono text-sm font-bold border-r shrink-0 ${
                            answerLocked && isPicked
                              ? "border-[#F1ECDE]/30 text-[#F1ECDE]"
                              : "border-[#C8BEA4] text-[#736D5A]"
                          }`}
                        >
                          {OPTION_LETTERS[idx] || idx + 1}
                        </div>
                        <div className="p-4 font-serif text-lg font-semibold flex items-center leading-snug">
                          {opt}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {answerLocked && (
                  <div className="mt-2 py-3 text-center border border-[#1B4B5A] bg-[#F7F3E8] font-mono text-xs uppercase tracking-[0.2em] text-[#1B4B5A] font-semibold">
                    Call Filed · Awaiting Settlement
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* RESULTS */}
        {gameState === "RESULTS" && (
          <div className="w-full max-w-sm bg-[#F7F3E8] border border-[#1A1A18] p-8 text-center ticket-shadow animate-ticket flex flex-col items-center gap-4">
            <span
              className={`font-mono text-xs uppercase tracking-[0.24em] font-semibold ${
                isCorrect === true
                  ? "text-[#1B4B5A]"
                  : isCorrect === false
                  ? "text-[#A04A2A]"
                  : "text-[#736D5A]"
              }`}
            >
              {isCorrect === true
                ? "Contract Settled · Gain"
                : isCorrect === false
                ? "Contract Settled · Loss"
                : "Market Closed"}
            </span>

            <div className="font-mono text-5xl font-bold text-[#1A1A18] tabular-nums py-4 border-y border-[#C8BEA4] w-full">
              ${score.toLocaleString()}
            </div>

            <p className="font-serif text-base text-[#736D5A]">
              Review the main exchange board for full floor standings.
            </p>

            {wonSlayerBonus && (
              <div className="mt-2 p-5 w-full bg-[#A04A2A] text-[#F1ECDE] border border-[#1A1A18]">
                <span className="font-mono text-[10px] uppercase tracking-[0.24em] block opacity-85">
                  Solo Victory · 2x Payout
                </span>
                <h3 className="font-serif italic text-3xl font-bold mt-1">
                  Slayer Bonus
                </h3>
                <p className="font-serif text-sm mt-2 opacity-95">
                  You were the only investor to call this contract correctly.
                </p>
              </div>
            )}
          </div>
        )}

        {/* GAME_OVER */}
        {gameState === "GAME_OVER" && (
          <div className="w-full max-w-sm bg-[#F7F3E8] border border-[#1A1A18] p-8 text-center ticket-shadow animate-ticket">
            <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-[#736D5A] block mb-2">
              Closing Bell
            </span>
            {isWinner && isTie ? (
              <h2 className="font-serif italic text-4xl font-bold text-[#1B4B5A]">
                Market Tie
              </h2>
            ) : isWinner ? (
              <h2 className="font-serif italic text-5xl font-bold text-[#1B4B5A]">
                Top Investor
              </h2>
            ) : (
              <h2 className="font-serif italic text-4xl font-semibold text-[#A04A2A]">
                Trading Halted
              </h2>
            )}
            <div className="font-mono text-3xl font-bold text-[#1A1A18] tabular-nums my-5 py-3 border-y border-[#C8BEA4]">
              ${score.toLocaleString()}
            </div>
            <p className="font-serif text-base text-[#736D5A] leading-relaxed">
              Check the main exchange screen for the final settlement ledger.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
