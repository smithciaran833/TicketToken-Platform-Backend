declare module 'fluent-ffmpeg' {
  interface FfmpegCommand {
    ffprobe(file: string, callback: (err: any, metadata: any) => void): void;
    // Add other methods as needed
  }
  
  function ffmpeg(input?: string): FfmpegCommand;
  
  namespace ffmpeg {
    function ffprobe(file: string, callback: (err: any, metadata: any) => void): void;
  }
  
  export = ffmpeg;
}
