import React from 'react';
import { getArena } from '../api';
import ModeTierList from './ModeTierList';

export default function Arena() {
  return (
    <ModeTierList
      navActive="arena"
      kicker="Tierlist · Arena"
      title="Arena"
      blurb="Every Arena champion graded S+ through D- for the live patch. Sort by win rate, pick or ban, or click a grade to filter."
      fetcher={getArena}
      showBan
      footNote="The tick on each win-rate bar marks the mode average. Pick and ban bars are relative to the highest value on screen."
    />
  );
}
