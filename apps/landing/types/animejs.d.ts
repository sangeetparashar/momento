declare module 'animejs' {
  interface AnimeParams {
    targets?: any;
    duration?: number;
    delay?: number | ((el: any, i: number, total: number) => number);
    easing?: string;
    autoplay?: any;
    opacity?: any;
    translateX?: any;
    translateY?: any;
    translateZ?: any;
    rotate?: any;
    rotateX?: any;
    rotateY?: any;
    rotateZ?: any;
    scale?: any;
    scaleX?: any;
    scaleY?: any;
    [key: string]: any;
  }

  interface OnScrollParams {
    target?: Element | null;
    enter?: string;
    leave?: string;
    [key: string]: any;
  }

  interface AnimeTimelineInstance {
    add(params: AnimeParams, offset?: string | number): AnimeTimelineInstance;
  }

  export function animate(targets: any, params: AnimeParams): any;
  export function onScroll(params: OnScrollParams): any;
  export function stagger(value: number, options?: any): any;
  export function timeline(params?: AnimeParams): AnimeTimelineInstance;
}
