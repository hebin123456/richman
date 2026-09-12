import Phaser from "phaser";

interface FitWrappedTextOptions {
  content: string;
  maxWidth: number;
  maxHeight: number;
  preferredFontSize: number;
  minFontSize: number;
  preferredLineSpacing: number;
  minLineSpacing?: number;
}

export function fitWrappedText(
  text: Phaser.GameObjects.Text,
  options: FitWrappedTextOptions,
) {
  const {
    content,
    maxWidth,
    maxHeight,
    preferredFontSize,
    minFontSize,
    preferredLineSpacing,
    minLineSpacing = 0,
  } = options;

  let fontSize = preferredFontSize;
  let lineSpacing = preferredLineSpacing;

  text.setWordWrapWidth(maxWidth, true);

  while (true) {
    text.setFontSize(fontSize);
    text.setLineSpacing(lineSpacing);
    text.setText(content);

    if (text.height <= maxHeight || fontSize <= minFontSize) {
      break;
    }

    fontSize -= 1;
    lineSpacing = Math.max(minLineSpacing, lineSpacing - 1);
  }

  return {
    fontSize,
    lineSpacing,
    textHeight: Math.ceil(text.height),
  };
}
