sed -i 's/const overall = player.overallValue || 75;/let overall = player.overallValue || 75;/g' src/components/SoccerPitch.tsx
sed -i 's/const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);/const cardBonusValue = isArtilheiroCard ? 5 : (assignedCard?.increaseOverall || 0);\n      overall += cardBonusValue;/g' src/components/SoccerPitch.tsx
