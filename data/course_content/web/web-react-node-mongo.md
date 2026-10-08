# React, Node and MongoDB

In the MERN stack, React renders the interface, Express on Node.js exposes a JSON API, and MongoDB stores documents. React components hold state with `useState` and run side effects such as data fetching with `useEffect`. State changes cause the component to re-render.

Express handles routes and middleware. A middleware function runs before the route handler, for example to verify a JWT. A JWT is a signed token that proves who the user is without a database lookup on every request, but it must be signed with a secret and should expire.

Mongoose adds schemas and validation on top of MongoDB. Never store plain-text passwords; hash them with bcrypt.
