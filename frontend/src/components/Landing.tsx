import React, { useState, useEffect } from 'react';
import { Sparkles, MessageSquare, Shield, Share2, Play, Zap, ArrowRight, Palette, Calculator } from 'lucide-react';
import { Logo } from './Logo';
import { BalanceFlowMap } from './BalanceFlowMap';

interface LandingProps {
  onLogin: () => void;
  onRegister: () => void;
}

export const Landing: React.FC<LandingProps> = ({ onLogin, onRegister }) => {
  const toggleTheme = () => {
    const isLight = document.body.classList.contains('theme-light');
    if (isLight) {
      document.body.classList.remove('theme-light');
      localStorage.setItem('split-sync-theme', 'dark');
    } else {
      document.body.classList.add('theme-light');
      localStorage.setItem('split-sync-theme', 'light');
    }
  };

  // Hero View state
  const [heroTab, setHeroTab] = useState<'flow' | 'calculator'>('flow');
  const [currentStep, setCurrentStep] = useState(0);

  const demoSteps = [
    {
      caption: "All square. No open balances.",
      nodes: [
        { id: 'you', name: 'You', netBalance: 0 },
        { id: 'rohan', name: 'Rohan', netBalance: 0 },
        { id: 'priya', name: 'Priya', netBalance: 0 },
      ],
      edges: [],
      showCeremony: true,
    },
    {
      caption: "Priya covered dinner (₹1,500). Everyone's share: ₹500.",
      nodes: [
        { id: 'you', name: 'You', netBalance: -500 },
        { id: 'rohan', name: 'Rohan', netBalance: -500 },
        { id: 'priya', name: 'Priya', netBalance: 1000 },
      ],
      edges: [
        { from: 'you', to: 'priya', amount: 500, fromName: 'You', toName: 'Priya' },
        { from: 'rohan', to: 'priya', amount: 500, fromName: 'Rohan', toName: 'Priya' },
      ],
      showCeremony: false,
    },
    {
      caption: "Rohan settles up with Priya. Rohan is clear.",
      nodes: [
        { id: 'you', name: 'You', netBalance: -500 },
        { id: 'rohan', name: 'Rohan', netBalance: 0 },
        { id: 'priya', name: 'Priya', netBalance: 500 },
      ],
      edges: [
        { from: 'you', to: 'priya', amount: 500, fromName: 'You', toName: 'Priya' },
      ],
      showCeremony: false,
    },
    {
      caption: "You settle up with Priya. Everything is clear!",
      nodes: [
        { id: 'you', name: 'You', netBalance: 0 },
        { id: 'rohan', name: 'Rohan', netBalance: 0 },
        { id: 'priya', name: 'Priya', netBalance: 0 },
      ],
      edges: [],
      showCeremony: true,
    },
  ];

  // Auto-play the simulator flow map
  useEffect(() => {
    if (heroTab !== 'flow') return;
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % demoSteps.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [heroTab]);

  // Simulator State
  const [simAmount, setSimAmount] = useState('1200');
  const [simMode, setSimMode] = useState<'equal' | 'unequal' | 'percentage' | 'share'>('equal');
  
  // Unequal values
  const [unequalRohan, setUnequalRohan] = useState('500');
  const [unequalPriya, setUnequalPriya] = useState('400');
  const [unequalAarav, setUnequalAarav] = useState('300');

  // Percentage values
  const [pctRohan, setPctRohan] = useState('40');
  const [pctPriya, setPctPriya] = useState('35');
  const [pctAarav, setPctAarav] = useState('25');

  // Shares values
  const [shareRohan, setShareRohan] = useState(3);
  const [sharePriya, setSharePriya] = useState(2);
  const [shareAarav, setShareAarav] = useState(1);

  const amountVal = parseFloat(simAmount) || 0;

  // Compute splits dynamically for the simulator
  let rohanShare = 0;
  let priyaShare = 0;
  let aaravShare = 0;
  let warningMessage: string | null = null;

  if (simMode === 'equal') {
    rohanShare = amountVal / 3;
    priyaShare = amountVal / 3;
    aaravShare = amountVal / 3;
  } else if (simMode === 'unequal') {
    const r = parseFloat(unequalRohan) || 0;
    const p = parseFloat(unequalPriya) || 0;
    const a = parseFloat(unequalAarav) || 0;
    rohanShare = r;
    priyaShare = p;
    aaravShare = a;
    const totalSplit = r + p + a;
    if (Math.abs(totalSplit - amountVal) > 0.01) {
      const diff = amountVal - totalSplit;
      warningMessage = diff > 0 
        ? `₹${diff.toFixed(2)} remaining to split` 
        : `₹${Math.abs(diff).toFixed(2)} over total amount`;
    }
  } else if (simMode === 'percentage') {
    const r = parseFloat(pctRohan) || 0;
    const p = parseFloat(pctPriya) || 0;
    const a = parseFloat(pctAarav) || 0;
    rohanShare = (amountVal * r) / 100;
    priyaShare = (amountVal * p) / 100;
    aaravShare = (amountVal * a) / 100;
    const totalPct = r + p + a;
    if (Math.abs(totalPct - 100) > 0.01) {
      warningMessage = `Total percentages: ${totalPct.toFixed(1)}% (must equal 100%)`;
    }
  } else if (simMode === 'share') {
    const totalShares = shareRohan + sharePriya + shareAarav;
    if (totalShares > 0) {
      rohanShare = (amountVal * shareRohan) / totalShares;
      priyaShare = (amountVal * sharePriya) / totalShares;
      aaravShare = (amountVal * shareAarav) / totalShares;
    }
  }

  return (
    <div className="min-h-screen bg-transparent text-slate-100 flex flex-col relative overflow-x-hidden font-sans cyber-dots" id="landing-root">
      
      {/* Visual background glows */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/15 blur-[120px] pointer-events-none animate-float-slow" />
      <div className="absolute bottom-[10%] left-[-10%] w-[600px] h-[600px] rounded-full bg-accent/10 blur-[130px] pointer-events-none animate-float-medium" />
      <div className="absolute top-[40%] left-[30%] w-[350px] h-[350px] rounded-full bg-primary/5 blur-[100px] pointer-events-none animate-glow-pulse" />
      
      {/* 1. Header/Navbar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex justify-between items-center z-20 shrink-0">
        <div className="flex items-center gap-2.5">
          <Logo className="w-8 h-8" />
          <div>
            <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              SplitSync
            </span>
            <span className="block text-[8px] tracking-widest text-slate-500 font-bold uppercase">Dynamic Engine</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            id="btn-theme-toggle"
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/5 transition hover:cursor-pointer flex items-center justify-center"
            title="Toggle theme color"
          >
            <Palette className="w-4 h-4" />
          </button>

          <button 
            id="btn-landing-login"
            onClick={onLogin} 
            className="text-xs font-bold text-slate-350 hover:text-slate-100 transition hover:cursor-pointer btn-magnetic"
          >
            Sign In
          </button>
          <button 
            id="btn-landing-start"
            onClick={onRegister}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 hover:shadow-lg hover:shadow-primary/20 text-obsidian text-xs font-extrabold shadow-md hover:cursor-pointer transition-all duration-200 btn-magnetic"
          >
            Get Started
          </button>
        </div>
      </header>

      {/* 2. Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-10 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center z-10">
        
        {/* Left Side: Copy and call to action */}
        <section className="lg:col-span-5 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            Designed for roommate houses, trips & projects
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-[1.15] text-slate-100">
            Split it. Settle it.{' '}
            <span className="block bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent text-cyber-glow mt-1.5">
              Move on.
            </span>
          </h1>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed max-w-lg mx-auto lg:mx-0">
            SplitSync resolves the awkwardness of sharing expenses. Record bills, chat about calculations in real-time, and let our greedy simplifier minimize transfers.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
            <button 
              id="btn-hero-cta-start"
              onClick={onRegister}
              className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-primary to-accent hover:brightness-110 hover:shadow-lg hover:shadow-primary/20 text-obsidian text-xs font-black shadow-xl hover:cursor-pointer btn-magnetic flex items-center justify-center gap-2 duration-200"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </button>
            <button 
              id="btn-hero-cta-play"
              onClick={() => document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold border border-white/5 hover:cursor-pointer flex items-center justify-center gap-2 transition btn-magnetic"
            >
              <Play className="w-3.5 h-3.5 text-cyan-400" />
              Try Live Playground
            </button>
          </div>

          <div className="flex items-center justify-center lg:justify-start gap-8 pt-6 border-t border-white/5">
            <div>
              <p className="text-xl font-outfit font-semibold text-slate-200">₹0</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">100% Free Forever</p>
            </div>
            <div>
              <p className="text-xl font-outfit font-semibold text-slate-200">1</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Click Settlement</p>
            </div>
            <div>
              <p className="text-xl font-extrabold text-slate-200">Realtime</p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">WebSocket chat</p>
            </div>
          </div>
        </section>

        {/* Right Side: Interactive Playground simulator */}
        <section className="lg:col-span-7 flex flex-col justify-center" id="playground">
          <div className="glass-card rounded-2xl p-6 md:p-8 border border-white/10 shadow-2xl relative card-glow-theme bg-slate-950/40 hover:border-primary/20 transition-all duration-300">
            
            {/* Dot highlights */}
            <div className="absolute top-3 right-4 flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/40" />
              <span className="w-2.5 h-2.5 rounded-full bg-green-500/40" />
            </div>

            <div className="mb-6">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest flex items-center gap-2">
                <Zap className="w-4 h-4 text-fuchsia-400" />
                Live Split Playground
              </h3>
              <p className="text-[10px] text-slate-500 mt-1">Adjust figures below to preview how our calculation engine operates</p>
            </div>
            {/* Tab navigation */}
            <div className="flex border-b border-white/5 p-0.5 bg-slate-950/45 rounded-xl mb-6 shrink-0 z-10 relative">
              <button
                type="button"
                onClick={() => setHeroTab('flow')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 hover:cursor-pointer ${
                  heroTab === 'flow'
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-3px_var(--color-primary-glow)] font-extrabold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5" /> How it Works
              </button>
              <button
                type="button"
                onClick={() => setHeroTab('calculator')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 hover:cursor-pointer ${
                  heroTab === 'calculator'
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-3px_var(--color-primary-glow)] font-extrabold'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" /> Playground Calculator
              </button>
            </div>

            {heroTab === 'flow' && (
              <div className="space-y-6 animate-fade-in relative z-10">
                {/* SVG Flow Map */}
                <div className="bg-slate-950/60 rounded-2xl p-4 border border-white/5 flex items-center justify-center min-h-[300px]">
                  {demoSteps[currentStep].showCeremony && demoSteps[currentStep].edges.length === 0 ? (
                    <div className="zero-balance-ceremony w-full text-center py-12 relative overflow-hidden animate-fade-in">
                      <div className="relative w-16 h-16 mx-auto mb-4">
                        <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-ping" style={{ animationDuration: '2s' }} />
                        <div className="absolute inset-1 rounded-full border-2 border-primary/50" />
                        <div className="absolute inset-0 flex items-center justify-center animate-scale-up">
                          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
                            <path
                              className="checkmark-path animate-checkmark-draw"
                              d="M5 13l4 4L19 7"
                              stroke="#3DFFD3"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                      </div>
                      <p className="text-xl font-bold text-slate-100 tracking-tight">All square.</p>
                      <p className="text-slate-500 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                        Every balance is settled.
                        This group is clear.
                      </p>
                    </div>
                  ) : (
                    <BalanceFlowMap
                      nodes={demoSteps[currentStep].nodes}
                      edges={demoSteps[currentStep].edges}
                      currentUserId="you"
                    />
                  )}
                </div>

                {/* Step caption */}
                <div className="bg-slate-900/40 border border-white/5 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
                  <p className="text-xs text-slate-300 font-semibold leading-relaxed transition-all duration-300">
                    {demoSteps[currentStep].caption}
                  </p>
                </div>

                {/* Step dots */}
                <div className="flex justify-center gap-2 pt-2">
                  {demoSteps.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCurrentStep(i)}
                      className={`w-2.5 h-2.5 rounded-full transition-all hover:cursor-pointer ${
                        currentStep === i ? 'bg-primary scale-110' : 'bg-white/10 hover:bg-white/20'
                      }`}
                      title={`Step ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
            )}

            {heroTab === 'calculator' && (
              <div className="space-y-6 animate-fade-in relative z-10">
                {/* Bill amount input */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block" htmlFor="input-sim-amount">
                    Total Bill Amount (₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-3 text-slate-500 font-bold text-xs">₹</span>
                    <input
                      id="input-sim-amount"
                      type="number"
                      value={simAmount}
                      onChange={(e) => setSimAmount(e.target.value)}
                      placeholder="0"
                      className="w-full pl-9 pr-4 py-3 rounded-xl glass-input text-xs font-outfit font-semibold"
                    />
                  </div>
                </div>

                {/* Mode toggles */}
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                    Select Splitting Style
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      id="btn-sim-equal"
                      type="button"
                      onClick={() => setSimMode('equal')}
                      className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition hover:cursor-pointer ${
                        simMode === 'equal'
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-white/5 border-white/5 text-slate-450 hover:bg-white/10 font-medium'
                      }`}
                    >
                      Equally
                    </button>
                    <button
                      id="btn-sim-unequal"
                      type="button"
                      onClick={() => setSimMode('unequal')}
                      className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition hover:cursor-pointer ${
                        simMode === 'unequal'
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-white/5 border-white/5 text-slate-450 hover:bg-white/10 font-medium'
                      }`}
                    >
                      Custom ₹
                    </button>
                    <button
                      id="btn-sim-percentage"
                      type="button"
                      onClick={() => setSimMode('percentage')}
                      className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition hover:cursor-pointer ${
                        simMode === 'percentage'
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-white/5 border-white/5 text-slate-450 hover:bg-white/10 font-medium'
                      }`}
                    >
                      Percentage %
                    </button>
                    <button
                      id="btn-sim-share"
                      type="button"
                      onClick={() => setSimMode('share')}
                      className={`py-2 px-3 rounded-lg text-[10px] font-bold border transition hover:cursor-pointer ${
                        simMode === 'share'
                          ? 'bg-primary/10 border-primary/40 text-primary'
                          : 'bg-white/5 border-white/5 text-slate-450 hover:bg-white/10 font-medium'
                      }`}
                    >
                      Shares Ratio
                    </button>
                  </div>
                </div>

                {/* Dynamic split input fields / adjusters */}
                {simMode === 'unequal' && (
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 space-y-3">
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Type exact split rupees</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[8px] font-semibold text-slate-400">Rohan (₹)</label>
                        <input
                          id="input-sim-unequal-rohan"
                          type="number"
                          value={unequalRohan}
                          onChange={(e) => setUnequalRohan(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-obsidian border border-white/5 text-[10px] font-outfit font-semibold text-right text-slate-200 focus:outline-none focus:border-primary/45 focus:ring-1 focus:ring-primary/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-semibold text-slate-400">Priya (₹)</label>
                        <input
                          id="input-sim-unequal-priya"
                          type="number"
                          value={unequalPriya}
                          onChange={(e) => setUnequalPriya(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-obsidian border border-white/5 text-[10px] font-outfit font-semibold text-right text-slate-200 focus:outline-none focus:border-primary/45 focus:ring-1 focus:ring-primary/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-semibold text-slate-400">Aarav (₹)</label>
                        <input
                          id="input-sim-unequal-aarav"
                          type="number"
                          value={unequalAarav}
                          onChange={(e) => setUnequalAarav(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-obsidian border border-white/5 text-[10px] font-outfit font-semibold text-right text-slate-200 focus:outline-none focus:border-primary/45 focus:ring-1 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {simMode === 'percentage' && (
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 space-y-3">
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Specify percentages</p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-[8px] font-semibold text-slate-400">Rohan (%)</label>
                        <input
                          id="input-sim-pct-rohan"
                          type="number"
                          value={pctRohan}
                          onChange={(e) => setPctRohan(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-obsidian border border-white/5 text-[10px] font-outfit font-semibold text-right text-slate-200 focus:outline-none focus:border-primary/45 focus:ring-1 focus:ring-primary/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-semibold text-slate-400">Priya (%)</label>
                        <input
                          id="input-sim-pct-priya"
                          type="number"
                          value={pctPriya}
                          onChange={(e) => setPctPriya(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-obsidian border border-white/5 text-[10px] font-outfit font-semibold text-right text-slate-200 focus:outline-none focus:border-primary/45 focus:ring-1 focus:ring-primary/30"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[8px] font-semibold text-slate-400">Aarav (%)</label>
                        <input
                          id="input-sim-pct-aarav"
                          type="number"
                          value={pctAarav}
                          onChange={(e) => setPctAarav(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-obsidian border border-white/5 text-[10px] font-outfit font-semibold text-right text-slate-200 focus:outline-none focus:border-primary/45 focus:ring-1 focus:ring-primary/30"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {simMode === 'share' && (
                  <div className="bg-slate-950/50 p-4 rounded-xl border border-white/5 space-y-3">
                    <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Tweak Shares weights</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-[8px] font-semibold text-slate-400">Rohan</span>
                        <div className="flex items-center gap-1">
                          <button
                            id="btn-sim-share-rohan-dec"
                            type="button"
                            onClick={() => setShareRohan(Math.max(0, shareRohan - 1))}
                            className="w-5 h-5 rounded bg-white/5 border border-white/5 font-extrabold flex items-center justify-center text-[9px] hover:bg-white/10 hover:cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-xs font-outfit font-semibold text-slate-200">{shareRohan}</span>
                          <button
                            id="btn-sim-share-rohan-inc"
                            type="button"
                            onClick={() => setShareRohan(shareRohan + 1)}
                            className="w-5 h-5 rounded bg-white/5 border border-white/5 font-extrabold flex items-center justify-center text-[9px] hover:bg-white/10 hover:cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-[8px] font-semibold text-slate-400">Priya</span>
                        <div className="flex items-center gap-1">
                          <button
                            id="btn-sim-share-priya-dec"
                            type="button"
                            onClick={() => setSharePriya(Math.max(0, sharePriya - 1))}
                            className="w-5 h-5 rounded bg-white/5 border border-white/5 font-extrabold flex items-center justify-center text-[9px] hover:bg-white/10 hover:cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-xs font-outfit font-semibold text-slate-200">{sharePriya}</span>
                          <button
                            id="btn-sim-share-priya-inc"
                            type="button"
                            onClick={() => setSharePriya(sharePriya + 1)}
                            className="w-5 h-5 rounded bg-white/5 border border-white/5 font-extrabold flex items-center justify-center text-[9px] hover:bg-white/10 hover:cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-[8px] font-semibold text-slate-400">Aarav</span>
                        <div className="flex items-center gap-1">
                          <button
                            id="btn-sim-share-aarav-dec"
                            type="button"
                            onClick={() => setShareAarav(Math.max(0, shareAarav - 1))}
                            className="w-5 h-5 rounded bg-white/5 border border-white/5 font-extrabold flex items-center justify-center text-[9px] hover:bg-white/10 hover:cursor-pointer"
                          >
                            -
                          </button>
                          <span className="text-xs font-outfit font-semibold text-slate-200">{shareAarav}</span>
                          <button
                            id="btn-sim-share-aarav-inc"
                            type="button"
                            onClick={() => setShareAarav(shareAarav + 1)}
                            className="w-5 h-5 rounded bg-white/5 border border-white/5 font-extrabold flex items-center justify-center text-[9px] hover:bg-white/10 hover:cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status alerts */}
                {warningMessage && (
                  <div className="bg-accent/10 border border-accent/20 text-accent rounded-xl p-3 text-[10px] font-bold text-center animate-fade-in shadow-sm">
                    {warningMessage}
                  </div>
                )}

                {/* Render simulator output */}
                <div className="space-y-3">
                  {/* Person 1: Rohan */}
                  <div className="flex justify-between items-center bg-slate-900/45 p-3.5 rounded-xl border border-white/5 hover:bg-slate-900/60 transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center font-bold text-xs">
                        R
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-200">Rohan Sharma</p>
                        <p className="text-[8px] text-slate-500 font-medium uppercase tracking-wider">Flatmate</p>
                      </div>
                    </div>
                    <span className="text-sm font-outfit font-semibold text-slate-200">
                      ₹{rohanShare.toFixed(2)}
                    </span>
                  </div>

                  {/* Person 2: Priya */}
                  <div className="flex justify-between items-center bg-slate-900/45 p-3.5 rounded-xl border border-white/5 hover:bg-slate-900/60 transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20 flex items-center justify-center font-bold text-xs">
                        P
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-200">Priya Patel</p>
                        <p className="text-[8px] text-slate-500 font-medium uppercase tracking-wider">Trip mate</p>
                      </div>
                    </div>
                    <span className="text-sm font-outfit font-semibold text-slate-200">
                      ₹{priyaShare.toFixed(2)}
                    </span>
                  </div>

                  {/* Person 3: Aarav */}
                  <div className="flex justify-between items-center bg-slate-900/45 p-3.5 rounded-xl border border-white/5 hover:bg-slate-900/60 transition-all">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center font-bold text-xs">
                        A
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-200">Aarav Mehta</p>
                        <p className="text-[8px] text-slate-500 font-medium uppercase tracking-wider">Co-worker</p>
                      </div>
                    </div>
                    <span className="text-sm font-outfit font-semibold text-slate-200">
                      ₹{aaravShare.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 3. Benefit Grids */}
      <section className="w-full max-w-7xl mx-auto px-6 py-12 border-t border-white/5 shrink-0">
        <h3 className="text-center text-xs font-black text-slate-500 uppercase tracking-widest mb-10">Why use SplitSync?</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-card rounded-2xl p-6 border border-white/5 hover:border-primary/20 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 relative overflow-hidden group">
            <div className="p-3 bg-primary/10 text-primary rounded-xl border border-primary/20 w-fit transition-colors group-hover:bg-primary group-hover:text-obsidian">
              <Share2 className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm mt-4 group-hover:text-primary transition-colors">Intelligent Settle Optimization</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
              No need to loop payments. Our greedy algorithm calculates peer balances to minimize transactions. Settle multiple items in a single click.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-white/5 hover:border-accent/20 hover:scale-[1.01] hover:shadow-xl hover:shadow-accent/5 transition-all duration-300 relative overflow-hidden group">
            <div className="p-3 bg-accent/10 text-accent rounded-xl border border-accent/20 w-fit transition-colors group-hover:bg-accent group-hover:text-obsidian">
              <MessageSquare className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm mt-4 group-hover:text-accent transition-colors">WebSocket Discussion Rooms</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
              Discuss splits directly inside bills using serverless websocket chat channels. Resolve arithmetic disputes without cluttering WhatsApp groups.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-6 border border-white/5 hover:border-primary/20 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 relative overflow-hidden group">
            <div className="p-3 bg-primary/10 text-primary rounded-xl border border-primary/20 w-fit transition-colors group-hover:bg-primary group-hover:text-obsidian">
              <Shield className="w-4 h-4" />
            </div>
            <h4 className="font-bold text-slate-200 text-sm mt-4 group-hover:text-primary transition-colors">Secure BaaS Architecture</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
              Powered entirely by client-to-database serverless calls with Supabase. Immediate session loads, instant message pushes, and zero latency.
            </p>
          </div>
        </div>
      </section>

      {/* 4. Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-white/5 text-center text-[10px] text-slate-600 z-10 shrink-0">
        <p>&copy; {new Date().getFullYear()} SplitSync. Made with precision for dynamic teams. Free forever.</p>
      </footer>

    </div>
  );
};
