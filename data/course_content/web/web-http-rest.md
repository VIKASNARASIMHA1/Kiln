# HTTP and REST APIs

HTTP is a request and response protocol. A request has a method, a URL, headers and an optional body. The common methods are GET to read, POST to create, PUT or PATCH to update and DELETE to remove.

Status codes tell the client what happened: 200 OK, 201 Created, 400 Bad Request, 401 Unauthorized, 404 Not Found and 500 Server Error. REST organises an API around resources, for example `GET /api/courses/42`, and usually exchanges JSON.

GET requests should be safe, meaning they do not change data. Authentication often uses a token sent in the `Authorization` header.
