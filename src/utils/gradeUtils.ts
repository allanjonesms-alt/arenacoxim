import { OverallStats } from '../types';

export const calculateAverage = (stats?: OverallStats) => {
  if (!stats || !stats.ratings || Object.keys(stats.ratings).length === 0) return 75;
  const ratings = Object.values(stats.ratings);
  const sum = ratings.reduce((acc, val) => acc + val, 0);
  return sum / ratings.length;
};

export const valueToLetter = (value: number) => {
  if (value >= 90) return 'A';
  if (value >= 80) return 'B';
  if (value >= 70) return 'C';
  if (value >= 60) return 'D';
  return 'E';
};

export const letterToValue = (letter: string) => {
  switch (letter) {
    case 'A': return 95;
    case 'B': return 85;
    case 'C': return 75;
    case 'D': return 65;
    case 'E': return 55;
    default: return 75;
  }
};

export const getGradeColor = (grade: string) => {
  switch (grade) {
    case 'A': return 'text-yellow-400';
    case 'B': return 'text-emerald-400';
    case 'C': return 'text-blue-400';
    case 'D': return 'text-orange-400';
    case 'E': return 'text-red-400';
    default: return 'text-gray-400';
  }
};

export const calculateGrade = (stats?: OverallStats) => {
  const avg = calculateAverage(stats);
  const grade = valueToLetter(avg);
  return { grade, color: getGradeColor(grade) };
};
