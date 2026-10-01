import { useEffect, useState } from "react";
import { getProjects } from "../api/projects";
import type { Project } from "../api/projects";

type ProjectsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; projects: Project[] };

export function Projects() {
  const [state, setState] = useState<ProjectsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    getProjects(controller.signal).then(
      (projects) => {
        if (!controller.signal.aborted) setState({ status: "loaded", projects });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: "error" });
      },
    );

    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ status: "loading" });
    setAttempt((value) => value + 1);
  }

  return (
    <section>
      <h1>Projects</h1>

      {state.status === "loading" && <p role="status">Loading projects…</p>}

      {state.status === "error" && (
        <div>
          <p role="alert">We couldn’t load the projects. Please try again.</p>
          <button type="button" onClick={retry}>Try again</button>
        </div>
      )}

      {state.status === "loaded" && state.projects.length === 0 && (
        <p>No projects to show yet.</p>
      )}

      {state.status === "loaded" && <div>
        {state.projects.map((project) => (
          <article key={project.id}>
            <h2>{project.title}</h2>
            <p>{project.description}</p>

            <ul>
              {project.tags.map((tag, index) => (
                <li key={`${tag}-${index}`}>{tag}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>}
    </section>
  );
}
