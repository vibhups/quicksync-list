'use client';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { User } from '@supabase/supabase-js';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Task = {
  id: string;
  content: string;
  completed: boolean;
};

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (data.user && isMounted) setUser(data.user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    let ignore = false;

    supabase
      .from('tasks')
      .select('*')
      .eq('owner_id', user.id)
      .then(({ data }) => {
        if (!ignore) setTasks(data || []);
      });

    const channel = supabase
      .channel('realtime:tasks')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `owner_id=eq.${user.id}`,
        },
        (payload) => {
          const task = payload.new as Task;
          setTasks((prev) => {
            const without = prev.filter((t) => t.id !== task.id);
            return [...without, task];
          });
        }
      )
      .subscribe();

    return () => {
      ignore = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const addTask = async () => {
    if (!text.trim() || !user) return;
    await supabase.from('tasks').insert({
      content: text.trim(),
      owner_id: user.id,
    });
    setText('');
  };

  const toggleTask = async (id: string, completed: boolean) => {
    await supabase.from('tasks').update({ completed }).eq('id', id);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const login = async () => {
    const email = prompt('Enter your email:');
    if (!email) return;
    await supabase.auth.signInWithOtp({ email });
    alert('Check your email for the magic login link.');
  };

  if (!user)
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>QuickSync List</h2>
        <button onClick={login}>Sign In with Email</button>
      </div>
    );

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: 'auto', fontFamily: 'sans-serif' }}>
      <h2>📝 QuickSync List</h2>
      <button onClick={logout} style={{ float: 'right' }}>
        Logout
      </button>
      <div style={{ marginTop: 40 }}>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a new task..."
          style={{ width: '70%', padding: 8 }}
        />
        <button onClick={addTask} style={{ marginLeft: 10 }}>
          Add
        </button>
      </div>
      <ul style={{ marginTop: 30 }}>
        {tasks.map((task) => (
          <li key={task.id}>
            <label>
              <input
                type="checkbox"
                checked={task.completed}
                onChange={(e) => toggleTask(task.id, e.target.checked)}
              />
              <span style={{ textDecoration: task.completed ? 'line-through' : 'none', marginLeft: 8 }}>
                {task.content}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
