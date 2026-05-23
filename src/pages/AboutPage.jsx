export default function AboutPage() {
  return (
    <section className="panel-card fade-in">
      <div className="section-header">
        <h2>About HarmonyHub</h2>
      </div>

      <p>
        HarmonyHub is designed to support beginner music students, especially students who may not have
        access to frequent private lessons. The app gives immediate, approachable feedback between lessons
        so students can build confidence and better practice habits.
      </p>

      <p>
        This capstone prototype focuses on violin fundamentals and practical independence. By turning
        practice into a guided cycle of attempt, feedback, and reflection, HarmonyHub can help students stay
        motivated and improve more consistently.
      </p>

      <div className="roadmap-card">
        <h3>Version 2.0 Roadmap</h3>
        <p>
          A future version would allow teachers or students to upload sheet music and create custom
          assignments. That would make HarmonyHub adaptable for classrooms, studios, and individual goals.
        </p>
      </div>
    </section>
  );
}
