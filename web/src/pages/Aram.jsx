import React from 'react';
import { getAram } from '../api';
import ModeTierList from './ModeTierList';

export default function Aram() {
  return (
    <ModeTierList
      navActive="aram"
      kicker="Tierlist · Howling Abyss"
      title="ARAM"
      blurb="Every Howling Abyss champion graded S+ through D- for the live patch. Sort by win rate, pick or sample size, or click a grade to filter."
      fetcher={getAram}
      footNote="The tick on each win-rate bar marks the mode average. Pick bars are relative to the highest value on screen."
    />
  );
}
