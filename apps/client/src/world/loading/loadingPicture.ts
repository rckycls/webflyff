// 2026-11-20 (loading screen): the picture V15 draws while a world loads, by Neuz's own rules.
//
//   CDPClient::OnReplace  Source/Neuz/DPClient.cpp:2274-2302  MapLoading2 to 4 at random (xRandom( 0, 3 )), the Guild
//                                                            Siege's (202, the 1:1 worlds 241-244), the instance
//                                                            dungeons' and the own guild house's own pictures
//   defineWorld.h                                            121 WI_INSTANCE_OMINOUS, 122 _OMINOUS_1, 123 _DREADFULCAVE,
//                                                            212-214 WI_GUILDHOUSE_SMALL to _LARGE
//
// Neuz draws it only on a change of world; FlyffWeb draws it on the first entry too (owner, 2026-11-20). A guild house is
// only ever the own guild's here (IsMyGuildHouse), so any of the three gets the guild house picture.

/** The three pictures Neuz picks from (`szMapFile`). `MapLoading5` to `7` are copies, and `MapLoading` is never drawn. */
export const RANDOM_PICTURES = ['MapLoading2.tga', 'MapLoading3.tga', 'MapLoading4.tga'] as const;

/** Every picture the screen may show: the converter's list (`THEME_FILES`) has these. */
export const LOADING_PICTURES: readonly string[] = [
  ...RANDOM_PICTURES, 'MapLoading_GuildWar.tga', 'MapLoading_Ominous.tga', 'MapLoading_Ominous_1.tga',
  'MapLoading_DreadfulCave.tga', 'MapLoading_Guildhouse.tga',
];

/** A world's own picture, or undefined for one that takes a random one. */
function ownPicture(worldId: number): string | undefined {
  if (worldId === 202 || (worldId >= 241 && worldId <= 244)) return 'MapLoading_GuildWar.tga';
  if (worldId === 121) return 'MapLoading_Ominous.tga';
  if (worldId === 122) return 'MapLoading_Ominous_1.tga';
  if (worldId === 123) return 'MapLoading_DreadfulCave.tga';
  if (worldId >= 212 && worldId <= 214) return 'MapLoading_Guildhouse.tga';
  return undefined;
}

/** The picture for `worldId`: its own, or one of the three by `random` (0 to under 1). */
export function loadingPicture(worldId: number, random: () => number = Math.random): string {
  return ownPicture(worldId) ?? RANDOM_PICTURES[Math.min(2, Math.floor(random() * 3))]!;
}

/**
 * The random picture picked ahead of time, so that the page can download it before it is needed (the character list,
 * and the world once it is on screen): `peek` says what the next entry into a world will show, `take` gives it and
 * picks again.
 */
export class LoadingPictures {
  private next: string | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  peek(worldId: number): string {
    return ownPicture(worldId) ?? this.ahead();
  }

  take(worldId: number): string {
    const own = ownPicture(worldId);
    if (own !== undefined) return own;
    const picture = this.ahead();
    this.next = null;
    return picture;
  }

  private ahead(): string {
    this.next ??= loadingPicture(0, this.random);
    return this.next;
  }
}

/** The page's one picker: the lobby peeks, the world screen takes. */
export const loadingPictures = new LoadingPictures();
