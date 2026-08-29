/** English copy for web Esports (desktop uses i18n). */

const MESSAGES = {
  'pros.title': 'Esports',
  'pros.blurb': 'Rift.lol ladder by country: current solo-queue rank, winrate, team, and accounts. Click a player for peak, seasons, and team history.',
  'pros.countries': 'By country',
  'pros.allCountries': 'All',
  'pros.search': 'Search player or team',
  'pros.role': 'Role',
  'pros.league': 'League',
  'pros.allLeagues': 'All leagues',
  'pros.player': 'Player',
  'pros.team': 'Team',
  'pros.rank': 'Solo queue',
  'pros.winrate': 'WR',
  'pros.peak': 'Peak',
  'pros.peakSrc': 'Rift.lol recorded peak — not an official Riot peak.',
  'pros.accounts': 'Accounts',
  'pros.history': 'Teams',
  'pros.present': 'now',
  'pros.empty': 'No players for this filter.',
  'pros.loading': 'Loading Rift.lol ladder…',
  'pros.fail': 'Rift.lol did not answer.',
  'pros.noRank': 'Rift.lol has no ranked account for this player.',
  'pros.current': 'Current',
  'pros.games': 'games',
  'pros.openProfile': 'Open in Rift',
  'pros.main': 'Main',
  'pros.names': 'Summoner names',
  'pros.seasons': 'Seasons',
  'pros.teammates': 'Current roster',
  'pros.peakRecorded': 'Peak recorded',
  'pros.latest': 'Latest',
  'pros.endSeason': 'End of season',
  'pros.topOnly': 'Showing the current top 50 on Rift.lol. Pick a country or a league for the full ladder.',
  'pros.note': 'Roster, rank, peak, and accounts come from Rift.lol. Peak is a recorded high, not an official Riot peak.',
};

export function t(key) {
  return MESSAGES[key] || key;
}
