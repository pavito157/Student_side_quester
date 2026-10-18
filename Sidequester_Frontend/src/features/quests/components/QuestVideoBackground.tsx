function QuestVideoBackground() {
  return (
    <div className="quest-video-layer" aria-hidden="true">
      <video
        className="quest-background-video"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      >
        <source src="/art/gemini_generated_video_342ca554.mp4" type="video/mp4" />
      </video>
      <div className="quest-video-overlay" />
    </div>
  )
}

export default QuestVideoBackground
