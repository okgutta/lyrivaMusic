import { $lyricsContainerExists, $minimalLyricsMode } from "../stores.ts";
import { $romanization } from "../uiState.ts";
import Global from "../../components/Global/Global.ts";
import { SpotifyPlayer } from "../../components/Global/SpotifyPlayer.ts";
import { Lyrics } from "./Animator/Main.ts";
import { PageContainer } from "../../components/Pages/PageView.ts";
import { Maid } from "../../modules/Maid.ts";
import { onFrame } from "../../modules/FrameLoop.ts";

export const getLyricsBetweenShow = () => ($minimalLyricsMode.get() ? 5 : 3);

export const SimpleLyricsMode_LetterEffectsStrengthConfig = {
  LongerThan: 1500,
  Longer: {
    Glow: 0.4,
    YOffset: 0.45,
    Scale: 1.103,
  },
  Shorter: {
    Glow: 0.285,
    YOffset: 0.1,
    Scale: 1.09,
  },
};

// Define types for lyrics objects
// Define the AnimatorStore interface for syllables
export interface SyllableAnimatorStore {
  Scale: any;
  YOffset: any;
  Glow: any;
  Opacity?: any;
  [key: string]: any;
}

// Define the AnimatorStore interface for letters
export interface LetterAnimatorStore {
  Scale: any;
  YOffset: any;
  Glow: any;
  [key: string]: any;
}

// Define the AnimatorStore interface for lines
export interface LineAnimatorStore {
  Glow: any;
  [key: string]: any;
}

// Define the Lead item interface for syllables
export interface SyllableLead {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime: number;
  LetterGroup?: boolean;
  Letters?: Array<{
    HTMLElement: HTMLElement;
    StartTime: number;
    EndTime: number;
    AnimatorStore?: LetterAnimatorStore;
    SLMAnimated?: boolean;
    PreSLMAnimated?: boolean;
  }>;
  BGWord?: boolean;
  Dot?: boolean;
  AnimatorStore?: SyllableAnimatorStore;
  SLMAnimated?: boolean;
  PreSLMAnimated?: boolean;
}

export interface LyricsSyllable {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime?: number;
  Status?: string;
  Syllables?: {
    Lead: SyllableLead[];
  };
  DotLine?: boolean;
  BGLine?: boolean;
  AnimatorStore?: LineAnimatorStore;
  SLMAnimated?: boolean;
  PreSLMAnimated?: boolean;
}

export interface LyricsLine {
  HTMLElement: HTMLElement;
  StartTime: number;
  EndTime: number;
  TotalTime?: number;
  Status?: string;
  DotLine?: boolean;
  Syllables?: {
    Lead: SyllableLead[];
  };
  AnimatorStore?: LineAnimatorStore;
}

export interface LyricsStatic {
  HTMLElement: HTMLElement;
}

export type LyricsType = "Syllable" | "Line" | "Static";

export const LyricsObject = {
  Types: {
    Syllable: {
      Lines: [] as LyricsSyllable[],
    },
    Line: {
      Lines: [] as LyricsLine[],
    },
    Static: {
      Lines: [] as LyricsStatic[],
    },
  },
};

export let CurrentLineLyricsObject = LyricsObject.Types.Syllable.Lines.length - 1;
export let LINE_SYNCED_CurrentLineLyricsObject = LyricsObject.Types.Line.Lines.length - 1;

export function SetWordArrayInCurentLine() {
  CurrentLineLyricsObject = LyricsObject.Types.Syllable.Lines.length - 1;

  if (CurrentLineLyricsObject >= 0) {
    LyricsObject.Types.Syllable.Lines[CurrentLineLyricsObject].Syllables = {
      Lead: [],
    };
  }
}

export function SetWordArrayInCurentLine_LINE_SYNCED() {
  LINE_SYNCED_CurrentLineLyricsObject = LyricsObject.Types.Line.Lines.length - 1;

  if (LINE_SYNCED_CurrentLineLyricsObject >= 0) {
    LyricsObject.Types.Line.Lines[LINE_SYNCED_CurrentLineLyricsObject].Syllables = {
      Lead: [],
    };
  }
}

export function ClearLyricsContentArrays() {
  LyricsObject.Types.Syllable.Lines = [];
  LyricsObject.Types.Line.Lines = [];
  LyricsObject.Types.Static.Lines = [];
}

let stopLyricsFrame: (() => void) | null = null;

const LyricsInterval = () => {
  // Only keep the frame loop alive while a lyrics container is actually mounted.
  // The original code scheduled `requestAnimationFrame` unconditionally at the
  // end, burning ~60 frames/s even when no page/container existed.
  if (!$lyricsContainerExists.get()) {
    stopLyricsFrame?.();
    stopLyricsFrame = null;
    return;
  }
  const progress = SpotifyPlayer.GetPosition();
  Lyrics.TimeSetter(progress);
  Lyrics.Animate(progress);
};

// Restart when a container appears; the loop self-stops when it goes away.
$lyricsContainerExists.listen((exists) => {
  if (exists && stopLyricsFrame === null) {
    stopLyricsFrame = onFrame(LyricsInterval);
  }
});

// 共享 FrameLoop（原先独占一条 rAF 链）；容器不存在时首帧自停
stopLyricsFrame = onFrame(LyricsInterval);

// Define proper types for event listener variables
let LinesEvListenerMaid: Maid | null = null;
let LinesEvListenerExists: boolean = false;

// Define proper type for event parameter
function LinesEvListener(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.classList.contains("line")) {
    let startTime: number | undefined;

    LyricsObject.Types.Line.Lines.forEach((line) => {
      if (line.HTMLElement === target) {
        startTime = line.StartTime;
        if (line.Syllables?.Lead && line.Syllables.Lead.length > 0) {
          startTime = line.Syllables.Lead[0].StartTime;
        }
      }
    });

    if (startTime !== undefined) {
      SpotifyPlayer.Seek(startTime);
      Global.Event.evoke("song:seek", startTime);
    }
  } else if (target.classList.contains("word")) {
    let startTime: number | undefined;

    LyricsObject.Types.Syllable.Lines.forEach((line) => {
      if (line.Syllables?.Lead) {
        line.Syllables.Lead.forEach((word, _, array) => {
          if (word.HTMLElement === target) {
            startTime = line.StartTime;
            if (array.length > 0) {
              startTime = array[0].StartTime;
            }
          }
        });
      }
    });

    if (startTime !== undefined) {
      SpotifyPlayer.Seek(startTime);
      Global.Event.evoke("song:seek", startTime);
    }
  } else if (target.classList.contains("Emphasis")) {
    let startTime: number | undefined;

    LyricsObject.Types.Syllable.Lines.forEach((line) => {
      if (line.Syllables?.Lead) {
        line.Syllables.Lead.forEach((word, _, array) => {
          if (word?.Letters) {
            word.Letters.forEach((letter) => {
              if (letter.HTMLElement === target) {
                startTime = line.StartTime;
                if (array.length > 0) {
                  startTime = array[0].StartTime;
                }
              }
            });
          }
        });
      }
    });

    if (startTime !== undefined) {
      SpotifyPlayer.Seek(startTime);
      Global.Event.evoke("song:seek", startTime);
    }
  }
}

export function addLinesEvListener() {
  if (LinesEvListenerExists) return;
  LinesEvListenerExists = true;
  LinesEvListenerMaid = new Maid();

  const el = PageContainer?.querySelector<HTMLElement>(".LyricsContainer .LyricsContent");
  if (!el) return;

  // Add event listener and store a reference to the handler function
  el.addEventListener("click", LinesEvListener);

  // Store a cleanup function in the Maid instead of the event listener result
  LinesEvListenerMaid.Give(() => {
    el.removeEventListener("click", LinesEvListener);
  });
}

export function removeLinesEvListener() {
  if (!LinesEvListenerExists) return;
  LinesEvListenerExists = false;

  // DestroyPage 先 remove() 再调这里时 el 为 null —— 但仍要销毁 Maid，
  // 否则每次开/关页面泄漏一个 Maid 及其闭包（长期持有已脱离 DOM 的节点）
  const el = PageContainer?.querySelector<HTMLElement>(".LyricsContainer .LyricsContent");
  el?.removeEventListener("click", LinesEvListener);

  if (LinesEvListenerMaid) {
    LinesEvListenerMaid.Destroy();
    LinesEvListenerMaid = null;
  }
}

export let isRomanized = $romanization.get();

export const setRomanizedStatus = (val: boolean) => {
  isRomanized = val;
  $romanization.set(val);
};

export const preHiddenDotLineMs = 500;
export const getInterludeTimePadding = () => (preHiddenDotLineMs + 50) * -1;
