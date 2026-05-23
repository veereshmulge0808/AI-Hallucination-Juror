import { motion } from 'motion/react';

export const ReliabilityGauge = ({ score }: { score: number }) => {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  
  let colorClass = 'text-red-500';
  let glowColor = 'drop-shadow-[0_0_12px_rgba(239,68,68,0.8)]';
  if (score >= 90) {
    colorClass = 'text-emerald-500';
    glowColor = 'drop-shadow-[0_0_12px_rgba(16,185,129,0.8)]';
  } else if (score >= 70) {
    colorClass = 'text-amber-400';
    glowColor = 'drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]';
  }

  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg className="transform -rotate-90 w-28 h-28">
        <circle
          cx="56"
          cy="56"
          r={radius}
          stroke="currentColor"
          strokeWidth="6"
          fill="transparent"
          className="text-neutral-800/50"
        />
        <motion.circle
          cx="56"
          cy="56"
          r={radius}
          stroke="currentColor"
          strokeWidth="6"
          fill="transparent"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className={`${colorClass} ${glowColor}`}
          strokeLinecap="round"
        />
      </svg>
      <div className={`absolute text-2xl font-bold font-mono ${colorClass} ${glowColor}`}>
        {score}
      </div>
      <div className="absolute text-[9px] uppercase tracking-widest text-neutral-500 bottom-2 pt-1 font-mono">
        SCORE
      </div>
    </div>
  );
};
