import type { ArReader } from '../ar/ArReader';
import type { MessageOf } from './types';

/**
 * ENVIRONMENTALL with `__ENVIRONMENT_EFFECT` on: `CDPClient::OnEnvironmentSetting` (`Neuz/DPClient.cpp:5512`):
 * `int nSeason = SEASON_NONE; ar >> nSeason;`. The rest of the function swaps some tree models for the season and
 * reads nothing more. The world server sends it first in the JOIN bundle (`CUser::AddEnvironmentSetting`,
 * `WORLDSERVER/User.cpp:1576-1584`, called from `CUser::Open`, :317), so without a table of contents nothing after it
 * could be read without this reader.
 */
export function readEnvironmentSetting(r: ArReader): MessageOf<'environmentSetting'> {
  return { type: 'environmentSetting', season: r.i32() };
}
