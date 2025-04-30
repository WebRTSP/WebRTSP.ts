import Log from 'loglevel';

Log.setLevel("TRACE");

function FormatTag(TAG: string) {
  return `[${TAG}]`;
}

export {
  Log,
  FormatTag,
};
