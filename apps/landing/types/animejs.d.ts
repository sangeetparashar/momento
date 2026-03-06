declare module 'animejs' {
  interface AnimeParams {
    targets?: any;
    duration?: number;
    delay?: number | Function;
    easing?: string;
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

  interface AnimeTimelineInstance {
    add(params: AnimeParams, offset?: string | number): AnimeTimelineInstance;
  }

  interface AnimeStatic {
    (params: AnimeParams): any;
    timeline(params?: AnimeParams): AnimeTimelineInstance;
    stagger(value: number, options?: any): any;
  }

  const anime: AnimeStatic;
  export default anime;
}
