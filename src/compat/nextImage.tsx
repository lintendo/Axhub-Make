import type { ImgHTMLAttributes } from 'react';

export type NextImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
  unoptimized?: boolean;
};

export default function NextImage({ unoptimized: _unoptimized, ...imageProps }: NextImageProps) {
  return <img {...imageProps} />;
}
