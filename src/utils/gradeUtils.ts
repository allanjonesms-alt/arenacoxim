import { OverallStats } from '../types';

export const calculateAverage = (stats?: OverallStats) => {
  if (!stats || !stats.ratings || Object.keys(stats.ratings).length === 0) return 75;
  const ratings = Object.values(stats.ratings);
  const sum = ratings.reduce((acc, val) => acc + val, 0);
  return sum / ratings.length;
};

export const valueToLetter = (value: number) => {
  return Math.round(value).toString().padStart(2, '0');
};

export const letterToValue = (letter: string) => {
  const val = parseInt(letter);
  return isNaN(val) ? 75 : val;
};

export const getGradeColor = (value: number | string) => {
  const num = typeof value === 'string' ? parseInt(value) : value;
  if (num >= 90) return 'text-yellow-400';
  if (num >= 80) return 'text-emerald-400';
  if (num >= 70) return 'text-blue-400';
  if (num >= 60) return 'text-orange-400';
  return 'text-red-400';
};

export const calculateGrade = (stats?: OverallStats, averagePoints: number = 0) => {
  const avg = calculateAverage(stats);
  const safeAvgPoints = isNaN(averagePoints) ? 0 : averagePoints;
  const performanceBonus = safeAvgPoints * 0.3;
  const finalScore = Math.min(105, Math.round(avg + performanceBonus));
  
  const grade = isNaN(finalScore) ? '75' : finalScore.toString().padStart(2, '0');
  return { grade, color: getGradeColor(isNaN(finalScore) ? 75 : finalScore) };
};
