// Vercel serverless function to proxy Claude API calls
const API_KEY = const API_KEY = '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';
// Fetch live FPL data from the official API
async function fetchFPLData() {
  try {
    const bootstrapRes = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/');
    const bootstrap = await bootstrapRes.json();

    const currentGameweek = bootstrap.events.find(e => e.is_current) || bootstrap.events.find(e => e.is_next);
    const gameweekId = currentGameweek?.id || 1;

    const fixturesRes = await fetch('https://fantasy.premierleague.com/api/fixtures/');
    const allFixtures = await fixturesRes.json();

    const upcomingFixtures = allFixtures.filter(f => f.event >= gameweekId && f.event <= gameweekId + 5);

    const teams = {};
    bootstrap.teams.forEach(t => {
      teams[t.id] = {
        name: t.name,
        shortName: t.short_name,
        strength: t.strength,
        strengthAttackHome: t.strength_attack_home,
        strengthAttackAway: t.strength_attack_away,
        strengthDefenceHome: t.strength_defence_home,
        strengthDefenceAway: t.strength_defence_away
      };
    });

    // Build FULL player data with prices
    const allPlayers = bootstrap.elements.map(p => ({
      id: p.id,
      name: p.web_name,
      fullName: `${p.first_name} ${p.second_name}`,
      team: teams[p.team]?.name,
      teamId: p.team,
      position: ['GKP', 'DEF', 'MID', 'FWD'][p.element_type - 1],
      price: p.now_cost / 10,
      form: parseFloat(p.form),
      totalPoints: p.total_points,
      pointsPerGame: parseFloat(p.points_per_game),
      selectedBy: p.selected_by_percent + '%',
      news: p.news,
      chanceOfPlaying: p.chance_of_playing_next_round,
      goalsScored: p.goals_scored,
      assists: p.assists,
      cleanSheets: p.clean_sheets,
      expectedGoals: parseFloat(p.expected_goals),
      expectedAssists: parseFloat(p.expected_assists),
      expectedGoalInvolvements: parseFloat(p.expected_goal_involvements),
      ictIndex: parseFloat(p.ict_index),
      minutes: p.minutes,
      bonus: p.bonus
    }));

    const formattedFixtures = upcomingFixtures.map(f => ({
      gameweek: f.event,
      homeTeam: teams[f.team_h]?.name,
      awayTeam: teams[f.team_a]?.name,
      homeTeamDifficulty: f.team_h_difficulty,
      awayTeamDifficulty: f.team_a_difficulty,
      kickoffTime: f.kickoff_time,
      finished: f.finished
    }));

    const topByForm = [...allPlayers]
      .filter(p => p.minutes > 200)
      .sort((a, b) => b.form - a.form)
      .slice(0, 30);

    // Get best value picks by position (high form, reasonable price)
    const bestValueByPosition = {
      GKP: [...allPlayers].filter(p => p.position === 'GKP' && p.minutes > 200).sort((a, b) => b.form - a.form).slice(0, 5),
      DEF: [...allPlayers].filter(p => p.position === 'DEF' && p.minutes > 200).sort((a, b) => b.form - a.form).slice(0, 10),
      MID: [...allPlayers].filter(p => p.position === 'MID' && p.minutes > 200).sort((a, b) => b.form - a.form).slice(0, 10),
      FWD: [...allPlayers].filter(p => p.position === 'FWD' && p.minutes > 200).sort((a, b) => b.form - a.form).slice(0, 10)
    };

    const injuredPlayers = allPlayers.filter(p => p.news && p.chanceOfPlaying !== null && p.chanceOfPlaying < 100);

    // Get differential picks (low ownership, high form)
    const differentials = [...allPlayers]
      .filter(p => p.minutes > 200 && parseFloat(p.selectedBy) < 10 && p.form > 4)
      .sort((a, b) => b.form - a.form)
      .slice(0, 10);

    return {
      currentGameweek: {
        id: gameweekId,
        name: currentGameweek?.name,
        deadline: currentGameweek?.deadline_time,
        finished: currentGameweek?.finished
      },
      upcomingFixtures: formattedFixtures,
      teams,
      topByForm,
      bestValueByPosition,
      differentials,
      injuredPlayers: injuredPlayers.slice(0, 30),
      allPlayers
    };
  } catch (error) {
    console.error('Error fetching FPL data:', error);
    return null;
  }
}

// Fetch pundit opinions and FPL community insights
async function fetchPunditData() {
  return `
PUNDIT & COMMUNITY INSIGHTS TO CONSIDER:
- FPL experts typically favor premium captains (Haaland, Salah) for consistency
- "The FPL Wire" and "FPL Focal" podcasts emphasize fixture difficulty over form
- Scout picks from the official FPL site prioritize upcoming fixture runs
- Community consensus: avoid hits unless absolutely necessary (>4 point swing expected)
- Template players: high ownership players that are "must-haves" each season
- Differential strategy: low-owned players (<5%) with good fixtures can be rank boosters
- Eye test matters: watching matches reveals more than stats alone
- Set-piece takers and penalty takers offer bonus point potential
- Consider blank and double gameweeks when planning transfers
- Popular strategies: rolling transfers, building team value early, saving wildcard for DGWs
`;
}

function buildLiveDataContext(fplData, punditData) {
  return `

=== LIVE FPL DATA ===

GAMEWEEK: ${fplData.currentGameweek.id} (${fplData.currentGameweek.name})
Deadline: ${fplData.currentGameweek.deadline}

UPCOMING FIXTURES (Next 5 GWs):
${fplData.upcomingFixtures.slice(0, 50).map(f =>
  `GW${f.gameweek}: ${f.homeTeam} vs ${f.awayTeam} (H-diff: ${f.homeTeamDifficulty}, A-diff: ${f.awayTeamDifficulty}) - ${f.kickoffTime ? new Date(f.kickoffTime).toLocaleString() : 'TBC'}`
).join('\n')}

TOP PLAYERS BY FORM (with PRICES):
${fplData.topByForm.map(p =>
  `${p.name} (${p.team}, ${p.position}) - PRICE: £${p.price}m, Form: ${p.form}, Points: ${p.totalPoints}, G: ${p.goalsScored}, A: ${p.assists}, xGI: ${p.expectedGoalInvolvements.toFixed(2)}, Owned: ${p.selectedBy}`
).join('\n')}

BEST VALUE BY POSITION (with PRICES):
GOALKEEPERS:
${fplData.bestValueByPosition.GKP.map(p => `${p.name} (${p.team}) - £${p.price}m, Form: ${p.form}, CS: ${p.cleanSheets}`).join('\n')}

DEFENDERS:
${fplData.bestValueByPosition.DEF.map(p => `${p.name} (${p.team}) - £${p.price}m, Form: ${p.form}, CS: ${p.cleanSheets}, G: ${p.goalsScored}, A: ${p.assists}`).join('\n')}

MIDFIELDERS:
${fplData.bestValueByPosition.MID.map(p => `${p.name} (${p.team}) - £${p.price}m, Form: ${p.form}, G: ${p.goalsScored}, A: ${p.assists}, xGI: ${p.expectedGoalInvolvements.toFixed(2)}`).join('\n')}

FORWARDS:
${fplData.bestValueByPosition.FWD.map(p => `${p.name} (${p.team}) - £${p.price}m, Form: ${p.form}, G: ${p.goalsScored}, A: ${p.assists}, xGI: ${p.expectedGoalInvolvements.toFixed(2)}`).join('\n')}

DIFFERENTIALS (Low ownership, high form):
${fplData.differentials.map(p => `${p.name} (${p.team}, ${p.position}) - £${p.price}m, Form: ${p.form}, Owned: ${p.selectedBy}`).join('\n')}

INJURIES/DOUBTS:
${fplData.injuredPlayers.map(p => `${p.name} (${p.team}) - £${p.price}m - ${p.chanceOfPlaying}% chance - "${p.news}"`).join('\n')}

${punditData}
=== END LIVE DATA ===
`;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body;

    // Check request type
    const isChat = body.chatMessage !== undefined;
    const isPlayerLookup = body.playerLookup !== undefined;

    // Fetch live FPL data
    const fplData = await fetchFPLData();
    const punditData = await fetchPunditData();

    let content;

    if (isPlayerLookup) {
      // Handle player-specific pundit lookup
      const { playerLookup } = body;

      // Find player in FPL data
      const playerData = fplData?.allPlayers?.find(p =>
        p.name.toLowerCase() === playerLookup.toLowerCase() ||
        p.fullName.toLowerCase().includes(playerLookup.toLowerCase())
      );

      let playerContext = '';
      if (playerData) {
        playerContext = `
PLAYER STATS:
- Name: ${playerData.fullName} (${playerData.name})
- Team: ${playerData.team}
- Position: ${playerData.position}
- Price: £${playerData.price}m
- Form: ${playerData.form}
- Total Points: ${playerData.totalPoints}
- Goals: ${playerData.goalsScored}, Assists: ${playerData.assists}
- xGI: ${playerData.expectedGoalInvolvements.toFixed(2)}
- Ownership: ${playerData.selectedBy}
- News: ${playerData.news || 'No injury news'}
`;
      }

      content = [
        {
          type: 'text',
          text: `You are an FPL expert providing a brief scout report on ${playerLookup}.

${playerContext}

Provide a concise pundit-style analysis (3-4 sentences) covering:
1. Recent form and eye-test observations
2. What FPL experts/scouts are saying about this player
3. Key factors to consider (fixtures, set pieces, underlying stats)
4. Buy/hold/sell recommendation

Keep it brief and punchy like a scout's quick take. Reference specific stats where relevant.`
        }
      ];
    } else if (isChat) {
      // Handle follow-up chat questions
      const { chatMessage, previousAnalysis, conversationHistory } = body;

      let liveDataContext = '';
      if (fplData) {
        liveDataContext = buildLiveDataContext(fplData, punditData);
      }

      content = [
        {
          type: 'text',
          text: `You are an expert FPL assistant continuing a conversation about the user's team.

PREVIOUS ANALYSIS:
${JSON.stringify(previousAnalysis, null, 2)}

${liveDataContext}

CONVERSATION HISTORY:
${conversationHistory || 'None yet'}

USER'S NEW QUESTION:
${chatMessage}

Please answer the user's question helpfully. If they ask about specific players, reference the LIVE DATA above for accurate prices, form, and stats. Keep your response conversational but informative. If recommending transfers, ALWAYS include the exact price of players.`
        }
      ];
    } else {
      // Handle initial team analysis
      const { pickTeamImage, pickTeamMediaType, transfersImage, transfersMediaType } = body;

      if (!pickTeamImage || !transfersImage) {
        return res.status(400).json({ error: 'Missing pickTeamImage or transfersImage' });
      }

      let liveDataContext = '';
      if (fplData) {
        liveDataContext = buildLiveDataContext(fplData, punditData);
      }

      content = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: pickTeamMediaType,
            data: pickTeamImage
          }
        },
        {
          type: 'text',
          text: 'This is my "Pick Team" page showing my current squad and formation.'
        },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: transfersMediaType,
            data: transfersImage
          }
        },
        {
          type: 'text',
          text: `This is my "Transfers" page showing available transfers and budget.

You are an expert Fantasy Premier League (FPL) manager assistant. Analyze both screenshots AND the live FPL data below.
${liveDataContext}

RESPOND WITH A JSON OBJECT ONLY (no markdown):
{
    "summary": "2-3 sentence team assessment",
    "formation": "e.g., 3-4-3",
    "formationReason": "Detailed explanation referencing specific fixtures and opponent weaknesses",
    "captainPicks": [
        {"player": "Name", "role": "captain", "reason": "Include: form rating, fixture (opponent + difficulty), xGI, goals/assists, why best pick"},
        {"player": "Name", "role": "vice-captain", "reason": "Detailed backup reasoning with stats"}
    ],
    "lineup": [
        {"player": "Name", "action": "keep OR bench OR sell", "reason": "Include: form, fixture difficulty, injury news, specific stats. Use 'keep' for players doing well (green), 'bench' for players to consider changing (orange), 'sell' for players that must be changed (red)"}
    ],
    "transfers": [
        {"out": "Player name", "in": "Replacement name", "outPrice": "£X.Xm", "inPrice": "£X.Xm", "reason": "Compare: form, fixtures, price difference, ownership %, xGI - ensure budget allows this!"}
    ],
    "chipAdvice": "When to use chips based on fixture data",
    "punditView": "What would FPL experts/pundits likely recommend for this team and why"
}

CRITICAL RULES:
1. ALL transfer recommendations MUST include accurate prices from the LIVE DATA
2. Check the user's budget before recommending transfers - don't suggest unaffordable players!
3. Reference specific stats: form ratings, FDR, xGI, ownership %
4. Include pundit perspective in your analysis
5. For transfers, show price comparison (e.g., "Sell Watkins £8.2m → Buy Isak £8.5m")`
        }
      ];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: content
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    // Include fixture data in response for the Upcoming section
    const responseData = {
      ...data,
      fplData: fplData ? {
        currentGameweek: fplData.currentGameweek,
        upcomingFixtures: fplData.upcomingFixtures.slice(0, 30),
        topByForm: fplData.topByForm.slice(0, 10)
      } : null
    };

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('Function error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
