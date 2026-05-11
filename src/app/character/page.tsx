import CharacterStudio from "@/components/character-studio";
import {
  CHARACTER_MODELS,
  defaultCharacterModel,
  isModelAvailable,
  type CharacterModelId,
} from "@/lib/character";

export const metadata = {
  title: "Character Studio — Drape",
  description:
    "Generate a hyperreal model that anchors every outfit in the batch.",
};

export default function CharacterPage() {
  const models = (Object.keys(CHARACTER_MODELS) as CharacterModelId[]).map((id) => {
    const cfg = CHARACTER_MODELS[id];
    return {
      id,
      label: cfg.label,
      provider: cfg.provider,
      estCostUsd: cfg.estCostUsd,
      description: cfg.description,
      available: isModelAvailable(id),
    };
  });

  return (
    <CharacterStudio models={models} defaultModel={defaultCharacterModel()} />
  );
}
