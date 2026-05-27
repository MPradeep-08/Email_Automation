import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function diffWords(original, current) {
  if (!original) original = '';
  if (!current) current = '';

  const orig = original.split(/(\s+)/);
  const curr = current.split(/(\s+)/);
  const dp = Array(orig.length + 1).fill().map(() => Array(curr.length + 1).fill(0));
  
  for (let i = 1; i <= orig.length; i++) {
    for (let j = 1; j <= curr.length; j++) {
      if (orig[i - 1] === curr[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  const result = [];
  let i = orig.length;
  let j = curr.length;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && orig[i - 1] === curr[j - 1]) {
      result.unshift({ type: 'normal', value: orig[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: curr[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', value: orig[i - 1] });
      i--;
    }
  }
  return result;
}
