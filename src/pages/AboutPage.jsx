export default function AboutPage() {
  return (
    <section className="panel-card fade-in">
      <div className="section-header">
        <h2>About HarmonyHub</h2>
      </div>

      <p>
        HarmonyHub supports beginner music students who may have limited access to private lessons.
        The app gives immediate, teacher-like feedback during practice so students can build reliable
        technique and independent practice habits.
      </p>

      <p>
        This capstone prototype focuses on practical fundamentals and guided, repeatable practice.
        By structuring practice as a cycle of attempt, targeted feedback, and reflection, HarmonyHub
        helps students make measurable progress between lessons.
      </p>

      <div className="roadmap-card">
        <h3>Version 2.0 Roadmap</h3>
        <p>
          A future version would let teachers create custom assignments and upload sheet music, making
          HarmonyHub adaptable for classrooms, studios, and individual goals.
        </p>
      </div>
    </section>
  );
}
