import CharacterStudio from "@/components/character-studio";
import {
  CHARACTER_MODELS,
  defaultCharacterModel,
  isModelAvailable,
  type CharacterModelId,
} from "@/lib/character";
import { listAssets } from "@/lib/assets";

export const metadata = {
  title: "Character Studio — Drape",
  description:
    "Generate a hyperreal model that anchors every outfit in the batch.",
};

export const dynamic = "force-dynamic";

export default async function CharacterPage() {
  const models = (Object.keys(CHARACTER_MODELS) as CharacterModelId[]).map(
    (id) => {
      const cfg = CHARACTER_MODELS[id];
      return {
        id,
        label: cfg.label,
        provider: cfg.provider,
        estCostUsd: cfg.estCostUsd,
        description: cfg.description,
        available: isModelAvailable(id),
      };
    },
  );

  const initialCharacters = await listAssets({ type: "character", limit: 100 });

  return (
    <CharacterStudio
      models={models}
      defaultModel={defaultCharacterModel()}
      initialCharacters={initialCharacters}
    />
  );
}
