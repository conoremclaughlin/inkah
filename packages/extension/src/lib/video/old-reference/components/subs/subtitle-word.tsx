import React, { useState } from 'react';

interface Props {
  tagName: string;
  keyName: string;
  word: string;
  context: string;
  shouldAddSpace: boolean;
}

function Word(props: Props) {
  const CustomTag = `${props.tagName}` as keyof JSX.IntrinsicElements;

  return (
    <CustomTag
      // @ts-ignore Expression produces a union type that is too complex to represent. ts(2590)
      className="inkahsubs-word"
    >
      {props.word}
      {props.shouldAddSpace && <span key={`space${props.keyName}`}> </span>}
    </CustomTag>
  );
}

export default Word;
