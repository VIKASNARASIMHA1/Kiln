import ChatPanel from '../components/ChatPanel';

export default function Tutor() {
  return (
    <>
      <header className="page-head">
        <h1>Ask the tutor</h1>
        <p className="muted">Questions are answered from the course lessons, with the sources listed under each answer.</p>
      </header>
      <ChatPanel suggestions={['What does gradient descent do?', 'What does status code 404 mean?', 'How do list comprehensions work?']} />
    </>
  );
}
