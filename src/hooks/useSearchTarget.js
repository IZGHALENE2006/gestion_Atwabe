import { useSearchParams } from 'react-router-dom';
import { useCallback } from 'react';

export default function useSearchTarget() {
  const [params] = useSearchParams();
  const target = params.get('record');
  return useCallback(row => !target || String(row._id) === target, [target]);
}
